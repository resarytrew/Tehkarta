import { useEffect, useMemo, useState } from 'react';
import type {
  ApprovedScenarioContext,
  Course,
  Lesson,
  LessonDesignArtifact,
  LessonDesignArtifactKind,
  LessonMaterialItem,
  MaterialsPayload,
  ScenarioPayload,
  ScenarioStage
} from '../types.js';

interface CommonProps {
  lesson: Lesson;
  course: Course | null;
  context: ApprovedScenarioContext | null;
  artifacts: LessonDesignArtifact[];
  busyKind: LessonDesignArtifactKind | null;
  onSave(kind: LessonDesignArtifactKind, payload: Record<string, unknown>): Promise<void>;
  onNavigate(step: number): void;
}

const missingLabels: Record<string, string> = {
  GOAL: 'утверждённая цель',
  PROBLEM_QUESTION: 'проблемный вопрос',
  OUTCOME: 'результат урока',
  METHOD: 'выбранный метод',
  CURRICULUM_CORE: 'требования рабочей программы',
  UMK_MAPPING: 'материалы УМК',
  CONTENT_SELECTION: 'решения по всем материалам УМК',
  COURSE_PLAN: 'утверждённый план курса и источники'
};

function scenarioDefaults(
  lesson: Lesson,
  context: ApprovedScenarioContext | null
): ScenarioStage[] {
  const researchMinutes = Math.max(5, lesson.durationMinutes - 25);
  const goal = context?.concept.goal ?? 'достичь цели урока';
  const problemQuestion = context?.concept.problemQuestion ?? 'ответить на проблемный вопрос';
  const bigIdea = context?.concept.bigIdea ?? 'сформулировать смысловой вывод';
  const outcome = context?.outcomes[0] ?? 'представить обоснованный результат';
  const methods = context?.methodology.methods.join(', ') || 'исследовательская работа';
  const techniques = context?.methodology.techniques.join(', ') || 'анализ и обсуждение';
  const contentTitles = [
    ...(context?.content.mandatoryRp.map((item) => item.text) ?? []),
    ...(context?.content.includedUmk.map((item) => item.title) ?? [])
  ];
  const content = contentTitles.slice(0, 3).join('; ') || 'утверждённое содержание урока';
  const masteredConcepts = context?.coursePlanning?.previousLessons.flatMap((item) => item.concepts).slice(0, 8) ?? [];
  const previousTopics = context?.coursePlanning?.previousLessons.map((item) => item.topic).slice(-2) ?? [];
  const currentConcepts = context?.coursePlanning?.currentLesson?.concepts ?? [];
  const nextTopic = context?.coursePlanning?.nextLessons[0]?.topic;
  const sourceTitles = [...new Set(context?.coursePlanning?.sourceFragments.map((item) => item.sourceTitle) ?? [])];
  const continuity = previousTopics.length > 0
    ? ` Актуализирует предыдущие темы: ${previousTopics.join('; ')}${masteredConcepts.length > 0 ? ` и понятия: ${masteredConcepts.join(', ')}` : ''}.`
    : '';
  const courseBridge = nextTopic ? ` Подготавливает переход к следующей теме «${nextTopic}».` : '';
  const stages = [
    ['Мотивация и вход в тему', 5, `Возвращает к цели: «${goal}» и создаёт учебную ситуацию.${continuity}`, 'Актуализируют уже освоенное и фиксируют вопросы к новой теме.'],
    ['Постановка проблемы', 5, `Предъявляет вопрос: «${problemQuestion}» и критерии ответа.`, 'Формулируют версии и выбирают направление поиска.'],
    [`Исследование · ${methods}`, researchMinutes, `Организует ${methods.toLowerCase()} с опорой на материалы: ${content}${sourceTitles.length > 0 ? `; документы курса: ${sourceTitles.join(', ')}` : ''}.`, `Используют приёмы «${techniques}», осваивают ${currentConcepts.join(', ') || 'новые понятия'}, анализируют содержание и собирают аргументы.`],
    ['Обсуждение и вывод', 10, `Связывает аргументы с большой идеей: «${bigIdea}».`, `Представляют выводы и демонстрируют результат: «${outcome}».`],
    ['Рефлексия', 5, `Возвращает класс к цели «${goal}» и собирает свидетельства результата.${courseBridge}`, `Формулируют итог по вопросу «${problemQuestion}» и связывают его с логикой курса.`]
  ] as const;
  return stages.map(([title, minutes, teacherAction, studentAction], index) => ({
    id: `stage-${index + 1}`,
    title,
    minutes,
    teacherAction,
    studentAction
  }));
}

function materialDefaults(
  context: ApprovedScenarioContext | null,
  stages: ScenarioStage[]
): LessonMaterialItem[] {
  const problemQuestion = context?.concept.problemQuestion ?? 'проблемному вопросу урока';
  const outcome = context?.outcomes[0] ?? 'итогового вывода';
  const researchStage = stages.find((stage) => stage.title.toLowerCase().includes('исслед'));
  const fromUmk = (context?.content.includedUmk ?? []).map((item, index) => ({
    id: `umk-${index + 1}`,
    title: item.title,
    purpose: `Источник для этапа «${researchStage?.title ?? 'Исследование'}» и ответа на вопрос «${problemQuestion}».`,
    source: [item.source.title, item.pages].filter(Boolean).join(', '),
    ready: true
  }));
  const fromCourseSources = [...new Map(
    (context?.coursePlanning?.sourceFragments ?? []).map((item) => [item.sourceId, item])
  ).values()].slice(0, 4).map((item, index) => ({
    id: `course-source-${index + 1}`,
    title: item.sourceTitle,
    purpose: `Разрешённый источник курса для этапа «${researchStage?.title ?? 'Исследование'}».`,
    source: `${item.sourceRole} · фрагмент ${item.ordinal}`,
    ready: true
  }));
  return [
    ...fromUmk,
    ...fromCourseSources,
    {
      id: 'teacher-working-sheet',
      title: 'Рабочий лист к проблемному вопросу',
      purpose: `Фиксация гипотез и аргументов для ответа на вопрос «${problemQuestion}».`,
      source: 'Авторский материал учителя',
      ready: false
    },
    {
      id: 'teacher-exit-ticket',
      title: 'Лист рефлексии и выходной билет',
      purpose: `Проверка достижения результата: «${outcome}».`,
      source: 'Сформировано из утверждённого результата урока',
      ready: false
    }
  ];
}

function artifact<T extends Record<string, unknown>>(
  artifacts: LessonDesignArtifact[],
  kind: LessonDesignArtifactKind
): LessonDesignArtifact<T> | undefined {
  return artifacts.find((item) => item.kind === kind) as LessonDesignArtifact<T> | undefined;
}

export function IntentOverview({ lesson, course, context, onNavigate }: CommonProps) {
  const approvedCore = [lesson.goal, lesson.problemQuestion, lesson.bigIdea].filter(
    (field) => field?.meta.status === 'APPROVED'
  ).length;
  return (
    <div className="workflow-panel">
      <div className="section-intro">
        <span className="eyebrow">Шаг 1 · замысел урока</span>
        <h2>Паспорт педагогического замысла</h2>
        <p>Исходные ограничения и готовность замысла перед детальной разработкой урока.</p>
      </div>
      <div className="workflow-summary-grid">
        <article><span>Курс</span><strong>{course?.title ?? 'Не выбран'}</strong></article>
        <article><span>Урок</span><strong>{lesson.title}</strong></article>
        <article><span>Время</span><strong>{lesson.durationMinutes} минут</strong></article>
        <article><span>Режим</span><strong>{lesson.designFreedom.mode}</strong></article>
        <article><span>Смысловые решения</span><strong>{approvedCore}/3 утверждено</strong></article>
        <article><span>Готовность сценария</span><strong>{context?.readiness.canGenerateScenario ? 'Готов' : 'Нужны решения'}</strong></article>
      </div>
      <div className="workflow-callout">
        <div><strong>Педагогическая технология</strong><p>{lesson.pedagogicalProfile.technology?.value ?? 'Не выбрана'}</p></div>
        <button className="button button-primary" type="button" onClick={() => onNavigate(2)}>Перейти к цели и результатам →</button>
      </div>
    </div>
  );
}

export function LessonWorkflowPanel(props: CommonProps & { step: 5 | 6 | 7 | 8 }) {
  const scenarioArtifact = artifact<ScenarioPayload>(props.artifacts, 'SCENARIO');
  const materialsArtifact = artifact<MaterialsPayload>(props.artifacts, 'MATERIALS');
  const [stages, setStages] = useState<ScenarioStage[]>(() =>
    scenarioArtifact?.payload.stages ?? scenarioDefaults(props.lesson, props.context)
  );
  const [materials, setMaterials] = useState<LessonMaterialItem[]>(() =>
    materialsArtifact?.payload.items ?? materialDefaults(props.context, stages)
  );

  useEffect(() => {
    setStages(scenarioArtifact?.payload.stages ?? scenarioDefaults(props.lesson, props.context));
  }, [props.lesson.id, props.lesson.durationMinutes, props.context, scenarioArtifact?.revision]);
  useEffect(() => {
    setMaterials(materialsArtifact?.payload.items ?? materialDefaults(props.context, stages));
  }, [props.lesson.id, materialsArtifact?.revision, props.context, scenarioArtifact?.revision]);

  const totalMinutes = stages.reduce((sum, stage) => sum + stage.minutes, 0);
  const checks = useMemo(() => {
    const values = [
      { label: 'Цель, проблемный вопрос и большая идея утверждены', ok: [props.lesson.goal, props.lesson.problemQuestion, props.lesson.bigIdea].every((field) => field?.meta.status === 'APPROVED') },
      { label: 'Есть хотя бы один утверждённый результат', ok: props.lesson.outcomes.some((field) => field.meta.status === 'APPROVED') },
      { label: 'Выбран и утверждён метод', ok: props.lesson.selectedMethods.some((field) => field.meta.status === 'APPROVED') },
      { label: 'По всем материалам УМК принято решение', ok: (props.context?.readiness.undecidedUmkCount ?? 1) === 0 },
      { label: `Сценарий укладывается в ${props.lesson.durationMinutes} минут`, ok: Boolean(scenarioArtifact) && totalMinutes === props.lesson.durationMinutes },
      { label: 'Для каждого этапа описаны действия учителя и учеников', ok: Boolean(scenarioArtifact) && stages.every((stage) => stage.teacherAction.trim() && stage.studentAction.trim()) },
      { label: 'Сценарий сформирован из актуальных решений урока', ok: scenarioArtifact?.payload.generatedFromLessonVersion === props.lesson.version },
      { label: 'Сценарий учитывает актуальный утверждённый план и источники курса', ok: Boolean(props.context?.coursePlanning) && scenarioArtifact?.payload.generatedFromCourseContextRevision === props.context?.coursePlanning?.contextRevision },
      { label: 'Материалы сформированы из актуального сценария', ok: materialsArtifact?.payload.generatedFromLessonVersion === props.lesson.version && materialsArtifact?.payload.generatedFromScenarioRevision === scenarioArtifact?.revision },
      { label: 'Материалы учитывают актуальный план и источники курса', ok: Boolean(props.context?.coursePlanning) && materialsArtifact?.payload.generatedFromCourseContextRevision === props.context?.coursePlanning?.contextRevision },
      { label: 'Все материалы подготовлены', ok: Boolean(materialsArtifact) && materials.length > 0 && materials.every((item) => item.ready) }
    ];
    return values;
  }, [materials, materialsArtifact, props.context, props.lesson, scenarioArtifact, stages, totalMinutes]);

  if (props.step === 5) {
    return (
      <div className="workflow-panel">
        <div className="section-intro"><span className="eyebrow">Шаг 5 · сценарий</span><h2>Этапы урока</h2><p>Время и действия участников сохраняются в версии сценария.</p></div>
        {!props.context?.readiness.canGenerateScenario ? (
          <div className="workflow-warning"><strong>Сценарий пока не готов к утверждению</strong><p>Не хватает: {(props.context?.readiness.missing ?? []).map((item) => missingLabels[item] ?? item).join(', ')}.</p></div>
        ) : null}
        <div className="scenario-timing"><strong>{totalMinutes} / {props.lesson.durationMinutes} минут</strong><span className={totalMinutes === props.lesson.durationMinutes ? 'is-ok' : 'is-error'}>{totalMinutes === props.lesson.durationMinutes ? 'Баланс соблюдён' : 'Скорректируйте время'}</span></div>
        <div className="scenario-stage-list">
          {stages.map((stage, index) => (
            <article className="scenario-stage" key={stage.id}>
              <div className="scenario-stage__top"><span>{index + 1}</span><input aria-label={`Название этапа ${index + 1}`} value={stage.title} onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, title: event.target.value } : item))}/><input className="minutes-input" type="number" min="1" max="120" aria-label={`Минуты этапа ${index + 1}`} value={stage.minutes} onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, minutes: Number(event.target.value) } : item))}/></div>
              <div className="scenario-stage__actions"><textarea aria-label={`Действия учителя ${index + 1}`} value={stage.teacherAction} onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, teacherAction: event.target.value } : item))}/><textarea aria-label={`Действия учеников ${index + 1}`} value={stage.studentAction} onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, studentAction: event.target.value } : item))}/></div>
            </article>
          ))}
        </div>
        <div className="workflow-actions"><button className="button button-ghost" type="button" onClick={() => setStages(scenarioDefaults(props.lesson, props.context))}>↻ Сформировать из контекста курса</button><button className="button button-secondary" type="button" disabled={props.busyKind === 'SCENARIO' || totalMinutes !== props.lesson.durationMinutes} onClick={() => void props.onSave('SCENARIO', { stages, generatedFromLessonVersion: props.lesson.version, generatedFromCoursePlanRevision: props.context?.coursePlanning?.planRevision ?? 0, generatedFromCourseContextRevision: props.context?.coursePlanning?.contextRevision ?? '' })}>{props.busyKind === 'SCENARIO' ? 'Сохраняем…' : `Сохранить сценарий${scenarioArtifact ? ` · версия ${scenarioArtifact.revision + 1}` : ''}`}</button><button className="button button-primary" type="button" disabled={props.busyKind === 'SCENARIO' || totalMinutes !== props.lesson.durationMinutes} onClick={() => void (async () => { try { await props.onSave('SCENARIO', { stages, generatedFromLessonVersion: props.lesson.version, generatedFromCoursePlanRevision: props.context?.coursePlanning?.planRevision ?? 0, generatedFromCourseContextRevision: props.context?.coursePlanning?.contextRevision ?? '' }); props.onNavigate(6); } catch { /* Ошибка уже показана родительским экраном. */ } })()}>Сохранить и перейти к материалам →</button></div>
      </div>
    );
  }

  if (props.step === 6) {
    return (
      <div className="workflow-panel">
        <div className="section-intro"><span className="eyebrow">Шаг 6 · материалы</span><h2>Комплект материалов урока</h2><p>Отметьте готовность источников, рабочих листов и опор для этапов сценария.</p></div>
        <div className="material-list">{materials.map((item, index) => <article className="material-editor" key={item.id}><input aria-label={`Название материала ${index + 1}`} value={item.title} onChange={(event) => setMaterials((current) => current.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))}/><textarea aria-label={`Назначение материала ${index + 1}`} value={item.purpose} onChange={(event) => setMaterials((current) => current.map((entry) => entry.id === item.id ? { ...entry, purpose: event.target.value } : entry))}/><div><span>{item.source ?? 'Источник не указан'}</span><label><input type="checkbox" checked={item.ready} onChange={(event) => setMaterials((current) => current.map((entry) => entry.id === item.id ? { ...entry, ready: event.target.checked } : entry))}/> Готов к уроку</label></div></article>)}</div>
        <div className="workflow-actions"><button className="button button-ghost" type="button" onClick={() => setMaterials(materialDefaults(props.context, stages))}>↻ Сформировать из сценария и контекста курса</button><button className="button button-ghost" type="button" onClick={() => setMaterials((current) => [...current, { id: crypto.randomUUID(), title: 'Новый материал', purpose: 'Укажите назначение материала.', source: 'Авторский материал учителя', ready: false }])}>＋ Добавить материал</button><button className="button button-secondary" type="button" disabled={props.busyKind === 'MATERIALS' || materials.length === 0} onClick={() => void props.onSave('MATERIALS', { items: materials, generatedFromLessonVersion: props.lesson.version, generatedFromScenarioRevision: scenarioArtifact?.revision ?? 0, generatedFromCoursePlanRevision: props.context?.coursePlanning?.planRevision ?? 0, generatedFromCourseContextRevision: props.context?.coursePlanning?.contextRevision ?? '' })}>{props.busyKind === 'MATERIALS' ? 'Сохраняем…' : 'Сохранить комплект'}</button><button className="button button-primary" type="button" disabled={props.busyKind === 'MATERIALS' || materials.length === 0} onClick={() => void (async () => { try { await props.onSave('MATERIALS', { items: materials, generatedFromLessonVersion: props.lesson.version, generatedFromScenarioRevision: scenarioArtifact?.revision ?? 0, generatedFromCoursePlanRevision: props.context?.coursePlanning?.planRevision ?? 0, generatedFromCourseContextRevision: props.context?.coursePlanning?.contextRevision ?? '' }); props.onNavigate(7); } catch { /* Ошибка уже показана родительским экраном. */ } })()}>Сохранить и перейти к экспертизе →</button></div>
      </div>
    );
  }

  if (props.step === 7) {
    const passed = checks.filter((check) => check.ok).length;
    return <div className="workflow-panel"><div className="section-intro"><span className="eyebrow">Шаг 7 · экспертиза</span><h2>Проверка целостности урока</h2><p>Автоматические проверки связности решений, времени и готовности материалов.</p></div><div className="expert-score"><strong>{passed}/{checks.length}</strong><span>{passed === checks.length ? 'Урок готов к выпуску' : 'Есть замечания'}</span></div><div className="expert-check-list">{checks.map((check) => <div className={check.ok ? 'expert-check is-passed' : 'expert-check is-failed'} key={check.label}><span>{check.ok ? '✓' : '!'}</span><p>{check.label}</p></div>)}</div><div className="workflow-actions"><button className="button button-primary" type="button" onClick={() => props.onNavigate(8)}>{passed === checks.length ? 'Перейти к карте урока →' : 'Открыть карту с замечаниями →'}</button></div></div>;
  }

  const exportData = { lesson: props.lesson, scenario: stages, materials, expertise: checks };
  function downloadMap() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${props.lesson.id}-lesson-map.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <div className="workflow-panel lesson-map"><div className="section-intro"><span className="eyebrow">Шаг 8 · карта урока</span><h2>{props.lesson.title}</h2><p>{props.context?.concept.bigIdea ?? 'Итоговая карта объединяет утверждённые решения урока.'}</p></div><section><h3>Цель</h3><p>{props.context?.concept.goal ?? 'Не утверждена'}</p></section><section><h3>Проблемный вопрос</h3><p>{props.context?.concept.problemQuestion ?? 'Не утверждён'}</p></section><section><h3>Результаты и методика</h3><ul>{(props.context?.outcomes ?? []).map((item) => <li key={item}>{item}</li>)}</ul><p>{props.context?.methodology.methods.join(', ') || 'Метод не выбран'}</p></section><section><h3>Сценарий · {totalMinutes} минут</h3>{stages.map((stage) => <div className="map-stage" key={stage.id}><strong>{stage.title} · {stage.minutes} мин</strong><span>{stage.studentAction}</span></div>)}</section><section><h3>Материалы</h3><ul>{materials.map((item) => <li key={item.id}>{item.ready ? '✓' : '○'} {item.title}</li>)}</ul></section><div className="workflow-actions no-print"><button className="button button-secondary" type="button" onClick={() => window.print()}>Печать</button><button className="button button-primary" type="button" onClick={downloadMap}>Скачать JSON</button><button className="button button-secondary" type="button" onClick={() => props.onNavigate(1)}>Завершить и вернуться к замыслу ↺</button></div></div>;
}
