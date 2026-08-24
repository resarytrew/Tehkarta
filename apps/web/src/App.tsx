import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, TehkartaApiClient } from './api.js';
import { ContentContextPanel } from './components/ContentContextPanel.js';
import { CourseSidebar } from './components/CourseSidebar.js';
import {
  GovernedFieldCard,
  type AiFieldAction
} from './components/GovernedFieldCard.js';
import { InvalidationPanel } from './components/InvalidationPanel.js';
import { MethodologyConstructor } from './components/MethodologyConstructor.js';
import type {
  AiProposalAction,
  ContentSelectionDecision,
  CoreDecisionKey,
  Course,
  CourseSummary,
  Lesson,
  LessonAiProposal,
  LessonContentContext,
  LessonInvalidation,
  LessonSummary,
  LessonUmkEvidenceItem,
  MeResponse,
  MethodologyRecommendation,
  MethodologyRecommendationBundle
} from './types.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const WORKSPACE_STORAGE_KEY = 'tehkarta.workspaceId';
const CSRF_STORAGE_KEY = 'tehkarta.csrfToken';

type ActiveDesignStep = 2 | 3 | 4;

const decisionCopy: Record<CoreDecisionKey, { title: string; description: string }> = {
  goal: {
    title: 'Цель урока',
    description: 'Что должно измениться в понимании и деятельности ученика к концу урока.'
  },
  problemQuestion: {
    title: 'Проблемный вопрос',
    description: 'Главный интеллектуальный вопрос, вокруг которого строится логика урока.'
  },
  bigIdea: {
    title: 'Большая идея',
    description: 'Смысловой вывод, связывающий предметное содержание с целостным пониманием темы.'
  }
};

const designModeLabels: Record<Lesson['designFreedom']['mode'], string> = {
  REGULATED: 'Регламентированный',
  BALANCED: 'Сбалансированный',
  CREATIVE: 'Творческий'
};

const contentFreedomLabels: Record<Lesson['designFreedom']['contentFreedom'], string> = {
  TEXTBOOK_STRICT: 'Строго по УМК',
  TEXTBOOK_PLUS: 'УМК + проверенные материалы',
  EXPANDED: 'Расширенный курс'
};

const aiActionMap: Record<AiFieldAction, AiProposalAction> = {
  variants: 'VARIANTS',
  regenerate: 'REGENERATE',
  improve: 'IMPROVE'
};

function storedWorkspaceId(): string {
  return (
    window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ??
    import.meta.env.VITE_DEFAULT_WORKSPACE_ID ??
    ''
  ).trim();
}

function storedCsrfToken(): string {
  return (
    window.sessionStorage.getItem(CSRF_STORAGE_KEY) ??
    import.meta.env.VITE_DEV_CSRF_TOKEN ??
    ''
  ).trim();
}

function querySelection(): { courseId: string | null; lessonId: string | null } {
  const query = new URLSearchParams(window.location.search);
  return {
    courseId: query.get('course'),
    lessonId: query.get('lesson')
  };
}

function persistSelection(courseId: string | null, lessonId: string | null): void {
  const url = new URL(window.location.href);
  if (courseId) url.searchParams.set('course', courseId);
  else url.searchParams.delete('course');
  if (lessonId) url.searchParams.set('lesson', lessonId);
  else url.searchParams.delete('lesson');
  window.history.replaceState(null, '', url);
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Сессия завершена. Выполните вход ещё раз.';
    if (error.status === 403) return error.message || 'Недостаточно прав для этой рабочей области.';
    if (error.status === 409 && error.payload.code === 'DEPENDENCY_STALE') {
      return 'Рекомендация устарела после изменений урока. Платформа уже может пересчитать её по актуальному утверждённому контексту.';
    }
    if (error.status === 409) {
      return 'Данные урока изменились в другой вкладке. Актуальная версия уже загружается.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
}

function firstLessonId(course: Course, lessons: LessonSummary[]): string | null {
  for (const section of course.sections) {
    const lessonId = section.lessonIds.find((id) => lessons.some((lesson) => lesson.id === id));
    if (lessonId) return lessonId;
  }
  return lessons[0]?.id ?? null;
}

function putProposalFirst(
  current: LessonAiProposal[],
  proposal: LessonAiProposal
): LessonAiProposal[] {
  return [proposal, ...current.filter((item) => item.id !== proposal.id)];
}

export interface AppProps {
  onSessionEnded(): void;
}

export function App({ onSessionEnded }: AppProps) {
  const [workspaceId] = useState(storedWorkspaceId);
  const [csrfToken] = useState(storedCsrfToken);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [invalidations, setInvalidations] = useState<LessonInvalidation[]>([]);
  const [proposals, setProposals] = useState<LessonAiProposal[]>([]);
  const [methodology, setMethodology] = useState<MethodologyRecommendationBundle | null>(null);
  const [contentContext, setContentContext] = useState<LessonContentContext | null>(null);
  const [methodologyLoading, setMethodologyLoading] = useState(false);
  const [methodologyBusyRecommendationId, setMethodologyBusyRecommendationId] = useState<string | null>(null);
  const [contentSelectionBusyMappingId, setContentSelectionBusyMappingId] = useState<string | null>(null);
  const [addingOutcome, setAddingOutcome] = useState(false);
  const [activeStep, setActiveStep] = useState<ActiveDesignStep>(2);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutatingKey, setMutatingKey] = useState<CoreDecisionKey | null>(null);
  const [aiRequestKey, setAiRequestKey] = useState<CoreDecisionKey | null>(null);
  const [applyingAiCandidate, setApplyingAiCandidate] = useState<{
    proposalId: string;
    candidateId: string;
  } | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const api = useMemo(() => {
    if (!workspaceId) return null;
    return new TehkartaApiClient({
      baseUrl: API_BASE_URL,
      workspaceId,
      ...(csrfToken ? { csrfToken } : {})
    });
  }, [workspaceId, csrfToken]);

  const handleAuthenticationFailure = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiRequestError && error.status === 401) {
        onSessionEnded();
        return true;
      }
      return false;
    },
    [onSessionEnded]
  );

  const refreshMethodology = useCallback(
    async (lessonId: string) => {
      if (!api) return;
      setMethodologyLoading(true);
      try {
        setMethodology(await api.getMethodologyRecommendations(lessonId));
      } finally {
        setMethodologyLoading(false);
      }
    },
    [api]
  );

  const loadLesson = useCallback(
    async (lessonId: string) => {
      if (!api) return;
      const [nextLesson, nextInvalidations, nextProposals, nextMethodology, nextContentContext] =
        await Promise.all([
          api.getLesson(lessonId),
          api.listInvalidations(lessonId),
          api.listAiProposals(lessonId),
          api.getMethodologyRecommendations(lessonId),
          api.getLessonContentContext(lessonId)
        ]);
      setLesson(nextLesson);
      setInvalidations(nextInvalidations);
      setProposals(nextProposals);
      setMethodology(nextMethodology);
      setContentContext(nextContentContext);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === nextLesson.id ? { ...summary, version: nextLesson.version } : summary
        )
      );
      persistSelection(nextLesson.courseId, nextLesson.id);
    },
    [api]
  );

  const loadCourse = useCallback(
    async (courseId: string, preferredLessonId?: string | null) => {
      if (!api) return;
      const [nextCourse, nextLessons] = await Promise.all([
        api.getCourse(courseId),
        api.listLessons(courseId)
      ]);
      setCourse(nextCourse);
      setLessons(nextLessons);

      const selectedLessonId =
        preferredLessonId && nextLessons.some((item) => item.id === preferredLessonId)
          ? preferredLessonId
          : firstLessonId(nextCourse, nextLessons);

      if (selectedLessonId) {
        await loadLesson(selectedLessonId);
      } else {
        setLesson(null);
        setInvalidations([]);
        setProposals([]);
        setMethodology(null);
        setContentContext(null);
        persistSelection(nextCourse.id, null);
      }
    },
    [api, loadLesson]
  );

  const initialize = useCallback(async () => {
    if (!api) {
      onSessionEnded();
      return;
    }

    setLoading(true);
    setFatalError(null);
    try {
      const [identity, nextCourses] = await Promise.all([api.me(), api.listCourses()]);
      setMe(identity);
      setCourses(nextCourses);

      const requested = querySelection();
      const selectedCourse =
        nextCourses.find((item) => item.id === requested.courseId) ?? nextCourses[0] ?? null;

      if (selectedCourse) {
        await loadCourse(selectedCourse.id, requested.lessonId);
      } else {
        setCourse(null);
        setLessons([]);
        setLesson(null);
        setInvalidations([]);
        setProposals([]);
        setMethodology(null);
        setContentContext(null);
      }
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, handleAuthenticationFailure, loadCourse, onSessionEnded]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function selectCourse(courseId: string): Promise<void> {
    setLoading(true);
    setFatalError(null);
    setActiveStep(2);
    try {
      await loadCourse(courseId, null);
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function selectLesson(lessonId: string): Promise<void> {
    setLoading(true);
    setFatalError(null);
    setActiveStep(2);
    try {
      await loadLesson(lessonId);
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentLesson(): Promise<void> {
    if (lesson) await loadLesson(lesson.id);
  }

  async function saveDraft(semanticKey: CoreDecisionKey, value: string): Promise<void> {
    if (!api || !lesson) return;
    setMutatingKey(semanticKey);
    setNotice(null);
    try {
      const field = lesson[semanticKey];
      if (field && field.value.trim() === value.trim() && field.meta.status === 'EDITED') return;
      const response = await api.editDecision({
        lessonId: lesson.id,
        semanticKey,
        value,
        expectedLessonVersion: lesson.version,
        ...(field ? { expectedFieldRevision: field.meta.revision } : {})
      });
      setLesson(response.data);
      setInvalidations(response.invalidations);
      setNotice('Черновик сохранён. Пока поле не применено, следующие шаги не используют его как утверждённое решение.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setMutatingKey(null);
    }
  }

  async function applyDecision(semanticKey: CoreDecisionKey, value: string): Promise<void> {
    if (!api || !lesson) return;
    setMutatingKey(semanticKey);
    setNotice(null);

    try {
      let workingLesson = lesson;
      let workingInvalidations = invalidations;
      let field = workingLesson[semanticKey];
      const normalized = value.trim();

      if (!field || field.value.trim() !== normalized) {
        const edited = await api.editDecision({
          lessonId: workingLesson.id,
          semanticKey,
          value: normalized,
          expectedLessonVersion: workingLesson.version,
          ...(field ? { expectedFieldRevision: field.meta.revision } : {})
        });
        workingLesson = edited.data;
        workingInvalidations = edited.invalidations;
        setLesson(workingLesson);
        setInvalidations(workingInvalidations);
        field = workingLesson[semanticKey];
      }

      if (!field) throw new Error('Поле не было создано после сохранения.');

      if (field.meta.status !== 'APPROVED') {
        const approved = await api.approveDecision({
          lessonId: workingLesson.id,
          semanticKey,
          expectedLessonVersion: workingLesson.version,
          expectedFieldRevision: field.meta.revision
        });
        workingLesson = approved.data;
        workingInvalidations = approved.invalidations;
      }

      setLesson(workingLesson);
      setInvalidations(workingInvalidations);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === workingLesson.id ? { ...summary, version: workingLesson.version } : summary
        )
      );
      await refreshMethodology(workingLesson.id);
      setNotice('Решение утверждено педагогом и стало авторитетным контекстом для следующих этапов.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setMutatingKey(null);
    }
  }

  async function aiAction(
    action: AiFieldAction,
    semanticKey: CoreDecisionKey
  ): Promise<void> {
    if (!api || !lesson) return;
    setAiRequestKey(semanticKey);
    setNotice(null);

    try {
      const proposal = await api.requestAiProposal({
        lessonId: lesson.id,
        semanticKey,
        action: aiActionMap[action],
        expectedLessonVersion: lesson.version,
        requestKey: `web-${crypto.randomUUID()}`,
        candidateCount: action === 'variants' ? 3 : 1
      });
      setProposals((current) => putProposalFirst(current, proposal));
      setNotice(
        `AI-запрос для поля «${decisionCopy[semanticKey].title}» поставлен в очередь. Утверждённое педагогом решение осталось без изменений.`
      );
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setAiRequestKey(null);
    }
  }

  async function applyAiCandidate(proposalId: string, candidateId: string): Promise<void> {
    if (!api || !lesson) return;
    setApplyingAiCandidate({ proposalId, candidateId });
    setNotice(null);

    try {
      const response = await api.applyAiProposalCandidate({
        lessonId: lesson.id,
        proposalId,
        candidateId,
        expectedLessonVersion: lesson.version
      });
      setLesson(response.data);
      setInvalidations(response.invalidations);
      setProposals((current) => putProposalFirst(current, response.proposal));
      setLessons((current) =>
        current.map((summary) =>
          summary.id === response.data.id
            ? { ...summary, version: response.data.version }
            : summary
        )
      );
      await refreshMethodology(response.data.id);
      setNotice(
        'AI-вариант явно применён педагогом. Новая формулировка сохранена как утверждённое решение педагога; происхождение AI осталось в истории ревизии.'
      );
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setApplyingAiCandidate(null);
    }
  }

  async function addApprovedOutcome(value: string): Promise<void> {
    if (!api || !lesson) return;
    setAddingOutcome(true);
    setNotice(null);
    try {
      const response = await api.addApprovedOutcome({
        lessonId: lesson.id,
        value,
        expectedLessonVersion: lesson.version
      });
      setLesson(response.data);
      setInvalidations(response.invalidations);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === response.data.id ? { ...summary, version: response.data.version } : summary
        )
      );
      await refreshMethodology(response.data.id);
      setNotice('Результат добавлен и сразу утверждён педагогом. Методический конструктор пересчитан по новой версии урока.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setAddingOutcome(false);
    }
  }

  async function useMethodologyRecommendation(
    recommendation: MethodologyRecommendation,
    choice: { formId: string; techniqueIds: string[] }
  ): Promise<void> {
    if (!api || !lesson) return;
    setMethodologyBusyRecommendationId(recommendation.id);
    setNotice(null);
    try {
      const response = await api.useMethodologyRecommendation({
        lessonId: lesson.id,
        recommendationId: recommendation.id,
        formId: choice.formId,
        techniqueIds: choice.techniqueIds,
        expectedLessonVersion: lesson.version
      });
      setLesson(response.data);
      setInvalidations(response.invalidations);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === response.data.id ? { ...summary, version: response.data.version } : summary
        )
      );
      await refreshMethodology(response.data.id);
      setNotice(
        `Метод «${recommendation.method.name}» применён как явное решение педагога. Метод, приёмы и форма сохранены со статусом APPROVED.`
      );
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      setNotice(errorMessage(error));
    } finally {
      setMethodologyBusyRecommendationId(null);
    }
  }

  async function rejectMethodologyRecommendation(
    recommendation: MethodologyRecommendation
  ): Promise<void> {
    if (!api || !lesson) return;
    setMethodologyBusyRecommendationId(recommendation.id);
    setNotice(null);
    try {
      await api.rejectMethodologyRecommendation(lesson.id, recommendation.id);
      await refreshMethodology(lesson.id);
      setNotice(
        `Рекомендация «${recommendation.method.name}» отклонена педагогом и скрыта для текущей версии Methodology Pack.`
      );
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      setNotice(errorMessage(error));
    } finally {
      setMethodologyBusyRecommendationId(null);
    }
  }

  async function setUmkContentDecision(
    item: LessonUmkEvidenceItem,
    decision: ContentSelectionDecision
  ): Promise<void> {
    if (!api || !lesson) return;
    setContentSelectionBusyMappingId(item.mappingId);
    setNotice(null);

    try {
      const response = await api.setUmkContentDecision({
        lessonId: lesson.id,
        mappingId: item.mappingId,
        decision,
        expectedLessonVersion: lesson.version
      });
      setLesson(response.data);
      setContentContext(response.contentContext);
      setInvalidations(response.invalidations);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === response.data.id
            ? { ...summary, version: response.data.version }
            : summary
        )
      );
      setNotice(
        response.changed
          ? decision === 'INCLUDED'
            ? `Материал «${item.title}» включён педагогом в утверждённый набор содержания. Зависимые блоки помечены для пересмотра.`
            : `Материал «${item.title}» исключён из содержания этого урока. Источник и решение сохранены в истории.`
          : 'Это решение уже зафиксировано; версия урока не изменена.'
      );
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      setNotice(errorMessage(error));
    } finally {
      setContentSelectionBusyMappingId(null);
    }
  }

  async function signOut(): Promise<void> {
    try {
      if (api && csrfToken) await api.logout();
    } catch {
      // Client credentials are cleared even if the server-side session has
      // already expired or the network is unavailable.
    } finally {
      onSessionEnded();
    }
  }

  if (!workspaceId) return null;

  if (fatalError && !course && !lesson) {
    return (
      <main className="connection-page">
        <div className="connection-card connection-card--error">
          <div className="brand-mark brand-mark--large">ТК</div>
          <span className="eyebrow">Не удалось открыть рабочее пространство</span>
          <h1>Рабочая область недоступна</h1>
          <p>{fatalError}</p>
          <div className="connection-error-actions">
            <button className="button button-primary" type="button" onClick={() => void initialize()}>
              Повторить
            </button>
            <button className="button button-ghost" type="button" onClick={onSessionEnded}>
              Войти заново
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="brand-mark">ТК</div>
          <div>
            <strong>Tehkarta</strong>
            <span>AI-методист · решение за педагогом</span>
          </div>
        </div>
        <div className="topbar__context">
          {course ? (
            <>
              <span>{course.subject}</span>
              <span>{course.grade} класс</span>
              <span>{course.academicYear}</span>
            </>
          ) : null}
        </div>
        <div className="topbar__user">
          <div className="user-avatar">{(me?.user.displayName ?? me?.user.email ?? 'П')[0]?.toUpperCase()}</div>
          <div className="topbar__user-copy">
            <strong>{me?.user.displayName ?? 'Педагог'}</strong>
            <span>{me?.workspace.role ?? 'Рабочая область'}</span>
          </div>
          <button className="icon-button" type="button" title="Выйти" onClick={() => void signOut()}>
            ↪
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <CourseSidebar
          courses={courses}
          selectedCourseId={course?.id ?? null}
          course={course}
          lessons={lessons}
          selectedLessonId={lesson?.id ?? null}
          onSelectCourse={(courseId) => void selectCourse(courseId)}
          onSelectLesson={(lessonId) => void selectLesson(lessonId)}
        />

        <main className="lesson-workspace">
          {loading ? <div className="loading-bar" aria-label="Загрузка" /> : null}
          {fatalError ? <div className="page-error">{fatalError}</div> : null}

          {lesson ? (
            <>
              <div className="lesson-heading">
                <div>
                  <div className="lesson-heading__breadcrumb">
                    {course?.title} <span>›</span>{' '}
                    {course?.sections.find((section) => section.id === lesson.sectionId)?.title}
                  </div>
                  <h1>{lesson.title}</h1>
                  <div className="lesson-heading__meta">
                    <span>{lesson.durationMinutes} минут</span>
                    <span>{designModeLabels[lesson.designFreedom.mode]}</span>
                    <span>{contentFreedomLabels[lesson.designFreedom.contentFreedom]}</span>
                    {lesson.pedagogicalProfile.technology?.value ? (
                      <span>{lesson.pedagogicalProfile.technology.value}</span>
                    ) : null}
                  </div>
                </div>
                <div className="lesson-version">
                  <span>Версия урока</span>
                  <strong>v{lesson.version}</strong>
                </div>
              </div>

              <nav className="design-steps" aria-label="Этапы проектирования урока">
                {[
                  ['01', 'Замысел'],
                  ['02', 'Цель и результаты'],
                  ['03', 'Методический конструктор'],
                  ['04', 'Содержание УМК'],
                  ['05', 'Сценарий'],
                  ['06', 'Материалы'],
                  ['07', 'Экспертиза'],
                  ['08', 'Карта урока']
                ].map(([number, label], index) => {
                  const stepNumber = index + 1;
                  const available = stepNumber === 2 || stepNumber === 3 || stepNumber === 4;
                  const current = activeStep === stepNumber;
                  return (
                    <button
                      type="button"
                      key={number}
                      className={`design-step ${available ? 'is-available' : ''} ${current ? 'is-current' : ''}`}
                      onClick={() => {
                        if (stepNumber === 2 || stepNumber === 3 || stepNumber === 4) {
                          setActiveStep(stepNumber);
                          return;
                        }
                        setNotice(
                          stepNumber < 2
                            ? 'Базовый замысел уже представлен утверждаемыми решениями урока. Отдельный экран будет подключён позже.'
                            : `Раздел «${label}» будет подключён после завершения текущего педагогического слоя.`
                        );
                      }}
                    >
                      <span>{number}</span>
                      {label}
                    </button>
                  );
                })}
              </nav>

              <div className={`workspace-grid ${activeStep === 3 || activeStep === 4 ? 'workspace-grid--methodology' : ''}`}>
                <section className="workspace-main-column">
                  {activeStep === 2 ? (
                    <>
                      <div className="section-intro">
                        <span className="eyebrow">Шаг 2 · педагогические решения</span>
                        <h2>Цель и смысловая рамка урока</h2>
                        <p>
                          Здесь AI может предлагать формулировки, но дальше передаются только решения,
                          которые педагог явно применил. Изменение утверждённого поля не переписывает
                          зависимые блоки молча — они помечаются как требующие пересмотра.
                        </p>
                      </div>

                      {(Object.keys(decisionCopy) as CoreDecisionKey[]).map((semanticKey) => {
                        const latestProposal = proposals.find(
                          (proposal) => proposal.semanticKey === semanticKey
                        );
                        const applyingCandidateId =
                          latestProposal && applyingAiCandidate?.proposalId === latestProposal.id
                            ? applyingAiCandidate.candidateId
                            : null;

                        return (
                          <GovernedFieldCard
                            key={semanticKey}
                            semanticKey={semanticKey}
                            title={decisionCopy[semanticKey].title}
                            description={decisionCopy[semanticKey].description}
                            field={lesson[semanticKey]}
                            busy={mutatingKey === semanticKey}
                            aiBusy={aiRequestKey === semanticKey}
                            latestProposal={latestProposal}
                            applyingAiCandidateId={applyingCandidateId}
                            onSaveDraft={(value) => saveDraft(semanticKey, value)}
                            onApply={(value) => applyDecision(semanticKey, value)}
                            onAiAction={aiAction}
                            onApplyAiCandidate={applyAiCandidate}
                          />
                        );
                      })}
                    </>
                  ) : activeStep === 3 ? (
                    <MethodologyConstructor
                      lesson={lesson}
                      bundle={methodology}
                      loading={methodologyLoading}
                      busyRecommendationId={methodologyBusyRecommendationId}
                      addingOutcome={addingOutcome}
                      onAddOutcome={addApprovedOutcome}
                      onUseRecommendation={useMethodologyRecommendation}
                      onRejectRecommendation={rejectMethodologyRecommendation}
                    />
                  ) : (
                    <ContentContextPanel
                      context={contentContext}
                      loading={loading}
                      busyMappingId={contentSelectionBusyMappingId}
                      onSetUmkDecision={setUmkContentDecision}
                    />
                  )}
                </section>

                <aside className="workspace-side-column">
                  <InvalidationPanel
                    invalidations={invalidations}
                    onRecalculate={() =>
                      setNotice(
                        'Пересчёт зависимых блоков будет выполняться отдельным управляемым действием. Текущие блоки остаются помеченными как устаревшие до решения педагога.'
                      )
                    }
                  />

                  <div className="context-panel">
                    <span className="eyebrow">
                      {activeStep === 2
                        ? 'Контекст AI'
                        : activeStep === 3
                          ? 'Контекст методики'
                          : 'Контекст содержания'}
                    </span>
                    <h3>Что уже зафиксировано</h3>
                    <div className="context-list">
                      <div>
                        <span>Педагогическая технология</span>
                        <strong>
                          {activeStep === 3
                            ? methodology?.pack.technology.name ?? 'Исследовательская технология'
                            : lesson.pedagogicalProfile.technology?.value ?? 'Не выбрана'}
                        </strong>
                      </div>
                      <div>
                        <span>Режим содержания</span>
                        <strong>{contentFreedomLabels[lesson.designFreedom.contentFreedom]}</strong>
                      </div>
                      <div>
                        <span>УМК</span>
                        <strong>{contentContext?.contentPack.title ?? course?.contentPackId ?? 'Не привязан'}</strong>
                      </div>
                      <div>
                        <span>Утверждённых результатов</span>
                        <strong>
                          {lesson.outcomes.filter((field) => field.meta.status === 'APPROVED').length}
                        </strong>
                      </div>
                      <div>
                        <span>Утверждённых методов</span>
                        <strong>
                          {lesson.selectedMethods.filter((field) => field.meta.status === 'APPROVED').length}
                        </strong>
                      </div>
                      {activeStep === 2 ? (
                        <div>
                          <span>AI-запросов по уроку</span>
                          <strong>{proposals.length}</strong>
                        </div>
                      ) : activeStep === 3 ? (
                        <div>
                          <span>Активных рекомендаций</span>
                          <strong>{methodology?.recommendations.length ?? 0}</strong>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span>Обязательное ядро РП</span>
                            <strong>{contentContext?.approvedContentSet.mandatoryRequirementIds.length ?? 0}</strong>
                          </div>
                          <div>
                            <span>Включено из УМК</span>
                            <strong>{contentContext?.approvedContentSet.includedUmkMappingIds.length ?? 0}</strong>
                          </div>
                          <div>
                            <span>Без решения</span>
                            <strong>{contentContext?.approvedContentSet.undecidedUmkMappingIds.length ?? 0}</strong>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {activeStep === 3 && methodology?.pack.technology.antiPatterns.length ? (
                    <div className="context-panel methodology-warning-panel">
                      <span className="eyebrow">Методическая защита</span>
                      <h3>Чего не должна делать технология</h3>
                      <ul>
                        {methodology.pack.technology.antiPatterns.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activeStep === 4 ? (
                    <div className="context-panel methodology-warning-panel">
                      <span className="eyebrow">Защита источников</span>
                      <h3>Что платформа не подменяет</h3>
                      <ul>
                        <li>Непроверенная привязка не выдаётся за содержание УМК.</li>
                        <li>Ограниченный лицензией текст не передаётся в браузер.</li>
                        <li>AI-дополнение не маркируется как РП или учебник.</li>
                      </ul>
                    </div>
                  ) : null}
                </aside>
              </div>
            </>
          ) : (
            <div className="empty-workspace">
              <div className="empty-workspace__icon">＋</div>
              <h2>В курсе пока нет уроков</h2>
              <p>Следующий шаг — создание урока из структуры рабочей программы.</p>
            </div>
          )}
        </main>
      </div>

      {notice ? (
        <div className="notice-toast" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Закрыть" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
