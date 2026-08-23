import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, TehkartaApiClient } from './api.js';
import { CourseSidebar } from './components/CourseSidebar.js';
import {
  GovernedFieldCard,
  type AiFieldAction
} from './components/GovernedFieldCard.js';
import { InvalidationPanel } from './components/InvalidationPanel.js';
import type {
  CoreDecisionKey,
  Course,
  CourseSummary,
  Lesson,
  LessonInvalidation,
  LessonSummary,
  MeResponse
} from './types.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const WORKSPACE_STORAGE_KEY = 'tehkarta.workspaceId';
const CSRF_STORAGE_KEY = 'tehkarta.csrfToken';

const decisionCopy: Record<
  CoreDecisionKey,
  { title: string; description: string }
> = {
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

function persistSelection(courseId: string | null, lessonId: string | null) {
  const url = new URL(window.location.href);
  if (courseId) url.searchParams.set('course', courseId);
  else url.searchParams.delete('course');
  if (lessonId) url.searchParams.set('lesson', lessonId);
  else url.searchParams.delete('lesson');
  window.history.replaceState(null, '', url);
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return 'Сессия не активна. Нужен вход в систему перед загрузкой рабочего пространства.';
    }
    if (error.status === 403) {
      return error.message || 'Недостаточно прав для этой рабочей области.';
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

interface ConnectionSetupProps {
  onConnect(workspaceId: string, csrfToken: string): void;
}

function ConnectionSetup({ onConnect }: ConnectionSetupProps) {
  const [workspaceId, setWorkspaceId] = useState(storedWorkspaceId());
  const [csrfToken, setCsrfToken] = useState(storedCsrfToken());

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = workspaceId.trim();
    if (!normalized) return;
    onConnect(normalized, csrfToken.trim());
  }

  return (
    <main className="connection-page">
      <div className="connection-card">
        <div className="brand-mark brand-mark--large">ТК</div>
        <div className="connection-card__copy">
          <span className="eyebrow">Tehkarta · рабочая среда педагога</span>
          <h1>Подключите рабочую область</h1>
          <p>
            Интерфейс уже работает с защищённым API. На этапе разработки ID рабочей области
            задаётся вручную; после подключения экрана входа этот шаг исчезнет.
          </p>
        </div>
        <form onSubmit={submit} className="connection-form">
          <label>
            ID рабочей области
            <input
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder="ws_..."
              autoComplete="off"
            />
          </label>
          <label>
            CSRF-токен текущей сессии
            <input
              type="password"
              value={csrfToken}
              onChange={(event) => setCsrfToken(event.target.value)}
              placeholder="Нужен только для изменений"
              autoComplete="off"
            />
          </label>
          <button className="button button-primary button-wide" type="submit" disabled={!workspaceId.trim()}>
            Открыть рабочее пространство
          </button>
        </form>
        <div className="connection-note">
          Сессионная cookie остаётся HttpOnly: интерфейс её не читает и не хранит.
        </div>
      </div>
    </main>
  );
}

export function App() {
  const [workspaceId, setWorkspaceId] = useState(storedWorkspaceId());
  const [csrfToken, setCsrfToken] = useState(storedCsrfToken());
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [invalidations, setInvalidations] = useState<LessonInvalidation[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutatingKey, setMutatingKey] = useState<CoreDecisionKey | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const api = useMemo(() => {
    if (!workspaceId) return null;
    const config = {
      baseUrl: API_BASE_URL,
      workspaceId,
      ...(csrfToken ? { csrfToken } : {})
    };
    return new TehkartaApiClient(config);
  }, [workspaceId, csrfToken]);

  const loadLesson = useCallback(
    async (lessonId: string) => {
      if (!api) return;
      const [nextLesson, nextInvalidations] = await Promise.all([
        api.getLesson(lessonId),
        api.listInvalidations(lessonId)
      ]);
      setLesson(nextLesson);
      setInvalidations(nextInvalidations);
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
        persistSelection(nextCourse.id, null);
      }
    },
    [api, loadLesson]
  );

  const initialize = useCallback(async () => {
    if (!api) return;
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
      }
    } catch (error) {
      setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, loadCourse]);

  useEffect(() => {
    if (api) void initialize();
  }, [api, initialize]);

  function connect(nextWorkspaceId: string, nextCsrfToken: string) {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspaceId);
    if (nextCsrfToken) window.sessionStorage.setItem(CSRF_STORAGE_KEY, nextCsrfToken);
    else window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
    setWorkspaceId(nextWorkspaceId);
    setCsrfToken(nextCsrfToken);
  }

  function resetConnection() {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
    setWorkspaceId('');
    setCsrfToken('');
    setCourses([]);
    setCourse(null);
    setLessons([]);
    setLesson(null);
    setMe(null);
    setFatalError(null);
  }

  async function selectCourse(courseId: string) {
    setLoading(true);
    setFatalError(null);
    try {
      await loadCourse(courseId, null);
    } catch (error) {
      setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function selectLesson(lessonId: string) {
    setLoading(true);
    setFatalError(null);
    try {
      await loadLesson(lessonId);
    } catch (error) {
      setFatalError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentLesson() {
    if (lesson) await loadLesson(lesson.id);
  }

  async function saveDraft(semanticKey: CoreDecisionKey, value: string) {
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
      setNotice('Черновик сохранён. Пока поле не применено, следующие шаги не должны использовать его как утверждённое решение.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        await refreshCurrentLesson();
      }
      throw new Error(errorMessage(error));
    } finally {
      setMutatingKey(null);
    }
  }

  async function applyDecision(semanticKey: CoreDecisionKey, value: string) {
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
      setNotice('Решение утверждено педагогом и стало авторитетным контекстом для следующих этапов.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        await refreshCurrentLesson();
      }
      throw new Error(errorMessage(error));
    } finally {
      setMutatingKey(null);
    }
  }

  function aiAction(action: AiFieldAction, semanticKey: CoreDecisionKey) {
    const actionLabel: Record<AiFieldAction, string> = {
      variants: 'варианты',
      regenerate: 'новую версию',
      improve: 'методическое улучшение'
    };
    setNotice(
      `Для поля «${decisionCopy[semanticKey].title}» выбран запрос AI: ${actionLabel[action]}. UI-контракт готов; следующий AI-срез подключит асинхронную генерацию без автоматической замены утверждённого текста.`
    );
  }

  if (!workspaceId) return <ConnectionSetup onConnect={connect} />;

  if (fatalError && !course && !lesson) {
    return (
      <main className="connection-page">
        <div className="connection-card connection-card--error">
          <div className="brand-mark brand-mark--large">ТК</div>
          <span className="eyebrow">Не удалось открыть рабочее пространство</span>
          <h1>Нужна активная сессия</h1>
          <p>{fatalError}</p>
          <div className="connection-error-actions">
            <button className="button button-primary" type="button" onClick={() => void initialize()}>
              Повторить
            </button>
            <button className="button button-ghost" type="button" onClick={resetConnection}>
              Сменить рабочую область
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
          <button className="icon-button" type="button" title="Сменить рабочую область" onClick={resetConnection}>
            ⋯
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
                ].map(([number, label], index) => (
                  <button
                    type="button"
                    key={number}
                    className={`design-step ${index <= 1 ? 'is-available' : ''} ${index === 1 ? 'is-current' : ''}`}
                    onClick={() =>
                      index > 1
                        ? setNotice(`Раздел «${label}» будет подключён после фиксации базовых педагогических решений.`)
                        : undefined
                    }
                  >
                    <span>{number}</span>
                    {label}
                  </button>
                ))}
              </nav>

              <div className="workspace-grid">
                <section className="workspace-main-column">
                  <div className="section-intro">
                    <span className="eyebrow">Шаг 2 · педагогические решения</span>
                    <h2>Цель и смысловая рамка урока</h2>
                    <p>
                      Здесь AI может предлагать формулировки, но дальше передаются только решения,
                      которые педагог явно применил. Изменение утверждённого поля не переписывает
                      зависимые блоки молча — они помечаются как требующие пересмотра.
                    </p>
                  </div>

                  {(Object.keys(decisionCopy) as CoreDecisionKey[]).map((semanticKey) => (
                    <GovernedFieldCard
                      key={semanticKey}
                      semanticKey={semanticKey}
                      title={decisionCopy[semanticKey].title}
                      description={decisionCopy[semanticKey].description}
                      field={lesson[semanticKey]}
                      busy={mutatingKey === semanticKey}
                      onSaveDraft={(value) => saveDraft(semanticKey, value)}
                      onApply={(value) => applyDecision(semanticKey, value)}
                      onAiAction={aiAction}
                    />
                  ))}
                </section>

                <aside className="workspace-side-column">
                  <InvalidationPanel
                    invalidations={invalidations}
                    onRecalculate={() =>
                      setNotice(
                        'Запрос на пересчёт будет отправляться в асинхронный AI job. До подтверждения педагога текущие зависимые блоки останутся помеченными как устаревшие.'
                      )
                    }
                  />

                  <div className="context-panel">
                    <span className="eyebrow">Контекст AI</span>
                    <h3>Что уже зафиксировано</h3>
                    <div className="context-list">
                      <div>
                        <span>Педагогическая технология</span>
                        <strong>{lesson.pedagogicalProfile.technology?.value ?? 'Не выбрана'}</strong>
                      </div>
                      <div>
                        <span>Режим содержания</span>
                        <strong>{contentFreedomLabels[lesson.designFreedom.contentFreedom]}</strong>
                      </div>
                      <div>
                        <span>УМК</span>
                        <strong>{course?.contentPackId ?? 'Не привязан'}</strong>
                      </div>
                      <div>
                        <span>Утверждённых ключевых решений</span>
                        <strong>
                          {[lesson.goal, lesson.problemQuestion, lesson.bigIdea].filter(
                            (field) => field?.meta.status === 'APPROVED'
                          ).length}{' '}
                          из 3
                        </strong>
                      </div>
                    </div>
                  </div>
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
