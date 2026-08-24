import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, TehkartaApiClient } from './api.js';
import { ContentContextPanel } from './components/ContentContextPanel.js';
import { CourseSidebar } from './components/CourseSidebar.js';
import { CoursePlanningPanel } from './components/CoursePlanningPanel.js';
import {
  GovernedFieldCard,
  type AiFieldAction
} from './components/GovernedFieldCard.js';
import { InvalidationPanel } from './components/InvalidationPanel.js';
import { MethodologyConstructor } from './components/MethodologyConstructor.js';
import { IntentOverview, LessonWorkflowPanel } from './components/LessonWorkflowPanels.js';
import type {
  AiProposalAction,
  ContentSelectionDecision,
  CoreDecisionKey,
  Course,
  CourseSummary,
  CoursePlanningSnapshot,
  CourseLessonProgression,
  CourseSourceRole,
  Lesson,
  LessonAiProposal,
  LessonDesignArtifact,
  LessonDesignArtifactKind,
  ApprovedScenarioContext,
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

type ActiveDesignStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const stepContextLabels: Record<ActiveDesignStep, string> = {
  1: 'Контекст замысла',
  2: 'Контекст AI',
  3: 'Контекст методики',
  4: 'Контекст содержания',
  5: 'Контекст сценария',
  6: 'Контекст материалов',
  7: 'Контекст экспертизы',
  8: 'Контекст карты урока'
};

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

function coreDecisionsApproved(lesson: Lesson): boolean {
  return (Object.keys(decisionCopy) as CoreDecisionKey[]).every(
    (semanticKey) => lesson[semanticKey]?.meta.status === 'APPROVED'
  );
}

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
  const [coursePlanning, setCoursePlanning] = useState<CoursePlanningSnapshot | null>(null);
  const [coursePlanningBusy, setCoursePlanningBusy] = useState<string | null>(null);
  const [showCoursePlanning, setShowCoursePlanning] = useState(() => !querySelection().lessonId);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [invalidations, setInvalidations] = useState<LessonInvalidation[]>([]);
  const [proposals, setProposals] = useState<LessonAiProposal[]>([]);
  const [methodology, setMethodology] = useState<MethodologyRecommendationBundle | null>(null);
  const [contentContext, setContentContext] = useState<LessonContentContext | null>(null);
  const [scenarioContext, setScenarioContext] = useState<ApprovedScenarioContext | null>(null);
  const [designArtifacts, setDesignArtifacts] = useState<LessonDesignArtifact[]>([]);
  const [artifactBusyKind, setArtifactBusyKind] = useState<LessonDesignArtifactKind | null>(null);
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

  const refreshScenarioContext = useCallback(
    async (lessonId: string) => {
      if (!api) return;
      setScenarioContext(await api.getScenarioContext(lessonId));
    },
    [api]
  );

  const loadLesson = useCallback(
    async (lessonId: string) => {
      if (!api) return;
      const [nextLesson, nextInvalidations, nextProposals, nextMethodology, nextContentContext, nextScenarioContext, nextArtifacts] =
        await Promise.all([
          api.getLesson(lessonId),
          api.listInvalidations(lessonId),
          api.listAiProposals(lessonId),
          api.getMethodologyRecommendations(lessonId),
          api.getLessonContentContext(lessonId),
          api.getScenarioContext(lessonId),
          api.listDesignArtifacts(lessonId)
        ]);
      setLesson(nextLesson);
      setActiveStep((current) =>
        current === 2 && coreDecisionsApproved(nextLesson) ? 3 : current
      );
      setInvalidations(nextInvalidations);
      setProposals(nextProposals);
      setMethodology(nextMethodology);
      setContentContext(nextContentContext);
      setScenarioContext(nextScenarioContext);
      setDesignArtifacts(nextArtifacts);
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
      const [nextCourse, nextLessons, nextCoursePlanning] = await Promise.all([
        api.getCourse(courseId),
        api.listLessons(courseId),
        api.getCoursePlanning(courseId)
      ]);
      setCourse(nextCourse);
      setLessons(nextLessons);
      setCoursePlanning(nextCoursePlanning);

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
        setScenarioContext(null);
        setDesignArtifacts([]);
        setCoursePlanning(nextCoursePlanning);
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
        setCoursePlanning(null);
        setLessons([]);
        setLesson(null);
        setInvalidations([]);
        setProposals([]);
        setMethodology(null);
        setContentContext(null);
        setScenarioContext(null);
        setDesignArtifacts([]);
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
    setShowCoursePlanning(true);
    try {
      await loadCourse(courseId, null);
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function selectLesson(lessonId: string): Promise<void> {
    if (!coursePlanning?.readiness.canDesignLessons) {
      setShowCoursePlanning(true);
      setNotice('Сначала сохраните и утвердите план курса и хотя бы один источник. После этого проектирование уроков станет доступно.');
      return;
    }
    setLoading(true);
    setFatalError(null);
    setActiveStep(2);
    try {
      await loadLesson(lessonId);
      setShowCoursePlanning(false);
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentLesson(): Promise<void> {
    if (lesson) await loadLesson(lesson.id);
  }

  async function refreshCoursePlanning(): Promise<void> {
    if (api && course) setCoursePlanning(await api.getCoursePlanning(course.id));
  }

  async function saveCoursePlan(input: {
    expectedRevision: number;
    goals: string[];
    plannedOutcomes: string[];
    contentSummary: string;
    lessons: CourseLessonProgression[];
  }): Promise<void> {
    if (!api || !course) return;
    setCoursePlanningBusy('save');
    setNotice(null);
    try {
      setCoursePlanning(await api.saveCoursePlan({ courseId: course.id, ...input }));
      setNotice('Черновик плана курса сохранён. Для использования в AI его нужно явно утвердить.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCoursePlanning();
      setNotice(errorMessage(error));
      throw error;
    } finally {
      setCoursePlanningBusy(null);
    }
  }

  async function approveCurrentCoursePlan(): Promise<void> {
    if (!api || !course || !coursePlanning?.plan) return;
    setCoursePlanningBusy('approve');
    setNotice(null);
    try {
      const approved = await api.approveCoursePlan(course.id, coursePlanning.plan.revision);
      setCoursePlanning(approved);
      setNotice('План курса утверждён и стал авторитетным контекстом для всех уроков курса.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCoursePlanning();
      setNotice(errorMessage(error));
      throw error;
    } finally {
      setCoursePlanningBusy(null);
    }
  }

  async function uploadCourseSource(input: {
    file: File;
    title: string;
    sourceRole: CourseSourceRole;
    rightsBasis: string;
  }): Promise<void> {
    if (!api || !course) return;
    setCoursePlanningBusy('upload');
    setNotice(null);
    try {
      setCoursePlanning(await api.uploadCourseSource({ courseId: course.id, ...input }));
      setNotice('Документ разобран и сохранён. Разрешите его использование, чтобы AI мог получать фрагменты.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      setNotice(errorMessage(error));
      throw error;
    } finally {
      setCoursePlanningBusy(null);
    }
  }

  async function approveCurrentCourseSource(bindingId: string): Promise<void> {
    if (!api || !course) return;
    setCoursePlanningBusy(bindingId);
    setNotice(null);
    try {
      setCoursePlanning(await api.approveCourseSource(course.id, bindingId));
      setNotice('Источник разрешён для использования в контексте AI этого курса.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      setNotice(errorMessage(error));
      throw error;
    } finally {
      setCoursePlanningBusy(null);
    }
  }

  async function navigateToStep(step: ActiveDesignStep): Promise<void> {
    if (!api || !lesson || step < 4) {
      setActiveStep(step);
      return;
    }
    try {
      const [freshLesson, freshScenarioContext, freshContentContext, freshArtifacts] =
        await Promise.all([
          api.getLesson(lesson.id),
          api.getScenarioContext(lesson.id),
          api.getLessonContentContext(lesson.id),
          api.listDesignArtifacts(lesson.id)
        ]);
      setLesson(freshLesson);
      setScenarioContext(freshScenarioContext);
      setContentContext(freshContentContext);
      setDesignArtifacts(freshArtifacts);
      setActiveStep(step);
    } catch (error) {
      if (!handleAuthenticationFailure(error)) setNotice(errorMessage(error));
    }
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
      if (coreDecisionsApproved(workingLesson)) setActiveStep(3);
      setLessons((current) =>
        current.map((summary) =>
          summary.id === workingLesson.id ? { ...summary, version: workingLesson.version } : summary
        )
      );
      await Promise.all([
        refreshMethodology(workingLesson.id),
        refreshScenarioContext(workingLesson.id)
      ]);
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
      if (coreDecisionsApproved(response.data)) setActiveStep(3);
      setProposals((current) => putProposalFirst(current, response.proposal));
      setLessons((current) =>
        current.map((summary) =>
          summary.id === response.data.id
            ? { ...summary, version: response.data.version }
            : summary
        )
      );
      await Promise.all([
        refreshMethodology(response.data.id),
        refreshScenarioContext(response.data.id)
      ]);
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
      await Promise.all([
        refreshMethodology(response.data.id),
        refreshScenarioContext(response.data.id)
      ]);
      setNotice('Результат добавлен и сразу утверждён педагогом. Методический конструктор пересчитан по новой версии урока.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      throw new Error(errorMessage(error));
    } finally {
      setAddingOutcome(false);
    }
  }

  async function saveDesignArtifact(
    kind: LessonDesignArtifactKind,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!api || !lesson) return;
    setArtifactBusyKind(kind);
    setNotice(null);
    try {
      const current = designArtifacts.find((item) => item.kind === kind);
      const saved = await api.saveDesignArtifact({
        lessonId: lesson.id,
        kind,
        expectedLessonVersion: lesson.version,
        expectedRevision: current?.revision ?? 0,
        payload
      });
      setDesignArtifacts((items) => [saved, ...items.filter((item) => item.kind !== kind)]);
      setNotice(kind === 'SCENARIO' ? 'Сценарий сохранён.' : 'Комплект материалов сохранён.');
    } catch (error) {
      if (handleAuthenticationFailure(error)) return;
      if (error instanceof ApiRequestError && error.status === 409) await refreshCurrentLesson();
      setNotice(errorMessage(error));
      throw new Error(errorMessage(error));
    } finally {
      setArtifactBusyKind(null);
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
      await Promise.all([
        refreshMethodology(response.data.id),
        refreshScenarioContext(response.data.id)
      ]);
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
      await refreshScenarioContext(response.data.id);
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
          selectedLessonId={showCoursePlanning ? null : lesson?.id ?? null}
          onSelectCourse={(courseId) => void selectCourse(courseId)}
          onSelectLesson={(lessonId) => void selectLesson(lessonId)}
          onOpenCoursePlan={() => setShowCoursePlanning(true)}
          coursePlanActive={showCoursePlanning}
        />

        <main className="lesson-workspace">
          {loading ? <div className="loading-bar" aria-label="Загрузка" /> : null}
          {fatalError ? <div className="page-error">{fatalError}</div> : null}

          {showCoursePlanning && course && coursePlanning ? (
            <CoursePlanningPanel
              key={`${course.id}:${coursePlanning.plan?.revision ?? 0}:${coursePlanning.sources.length}`}
              course={course}
              lessons={lessons}
              snapshot={coursePlanning}
              busyAction={coursePlanningBusy}
              onSave={saveCoursePlan}
              onApprove={approveCurrentCoursePlan}
              onUpload={uploadCourseSource}
              onApproveSource={approveCurrentCourseSource}
              onOpenLesson={(lessonId) => void selectLesson(lessonId)}
            />
          ) : lesson ? (
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
                  const available = true;
                  const current = activeStep === stepNumber;
                  return (
                    <button
                      type="button"
                      key={number}
                      className={`design-step ${available ? 'is-available' : ''} ${current ? 'is-current' : ''}`}
                      onClick={() => {
                        void navigateToStep(stepNumber as ActiveDesignStep);
                      }}
                    >
                      <span>{number}</span>
                      {label}
                    </button>
                  );
                })}
              </nav>

              <div className={`workspace-grid ${activeStep !== 2 ? 'workspace-grid--methodology' : ''}`}>
                <section className="workspace-main-column">
                  {activeStep === 1 ? (
                    <IntentOverview
                      lesson={lesson}
                      course={course}
                      context={scenarioContext}
                      artifacts={designArtifacts}
                      busyKind={artifactBusyKind}
                      onSave={saveDesignArtifact}
                      onNavigate={(step) => void navigateToStep(step as ActiveDesignStep)}
                    />
                  ) : activeStep === 2 ? (
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
                      <div className="workflow-next-card">
                        <div>
                          <strong>Следующий шаг использует только утверждённые решения</strong>
                          <p>
                            Утверждено смысловых полей:{' '}
                            {[lesson.goal, lesson.problemQuestion, lesson.bigIdea].filter(
                              (field) => field?.meta.status === 'APPROVED'
                            ).length}
                            /3.
                          </p>
                        </div>
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => void navigateToStep(3)}
                        >
                          Перейти к методическому конструктору →
                        </button>
                      </div>
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
                      onNext={() => void navigateToStep(4)}
                    />
                  ) : activeStep === 4 ? (
                    <ContentContextPanel
                      context={contentContext}
                      loading={loading}
                      busyMappingId={contentSelectionBusyMappingId}
                      onSetUmkDecision={setUmkContentDecision}
                      onNext={() => void navigateToStep(5)}
                    />
                  ) : (
                    <LessonWorkflowPanel
                      step={activeStep}
                      lesson={lesson}
                      course={course}
                      context={scenarioContext}
                      artifacts={designArtifacts}
                      busyKind={artifactBusyKind}
                      onSave={saveDesignArtifact}
                      onNavigate={(step) => void navigateToStep(step as ActiveDesignStep)}
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
                      {stepContextLabels[activeStep]}
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
