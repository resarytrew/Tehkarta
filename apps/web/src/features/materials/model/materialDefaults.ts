import type { ApprovedScenarioContext, LessonMaterialItem, ScenarioStage } from '../../../entities/artifact/model.js';

export function materialDefaults(context: ApprovedScenarioContext | null, stages: ScenarioStage[]): LessonMaterialItem[] {
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
  const fromCourse = [...new Map(
    (context?.coursePlanning?.sourceFragments ?? []).map((item) => [item.sourceId, item])
  ).values()].slice(0, 4).map((item, index) => ({
    id: `course-source-${index + 1}`,
    title: item.sourceTitle,
    purpose: `Разрешённый источник курса для этапа «${researchStage?.title ?? 'Исследование'}».`,
    source: `${item.sourceRole} · фрагмент ${item.ordinal}`,
    ready: true
  }));
  const techniqueIds = new Set(context?.methodology.techniqueSelections.map((item) => item.techniqueId) ?? []);
  const methodMaterials: LessonMaterialItem[] = [];
  if (techniqueIds.has('source-passport')) methodMaterials.push({ id: 'method-source-passport', title: 'Паспорт источника', purpose: 'Фиксация происхождения, позиции автора, адресата и ограничений каждого источника.', source: 'Шаблон выбранного приёма', ready: false });
  if (techniqueIds.has('evidence-table') || techniqueIds.has('fact-evidence-conclusion')) methodMaterials.push({ id: 'method-evidence-table', title: 'Таблица «факт — доказательство — вывод»', purpose: `Сбор проверяемых аргументов для ответа на вопрос «${problemQuestion}».`, source: 'Шаблон выбранного приёма', ready: false });
  if (techniqueIds.has('competing-hypotheses') || techniqueIds.has('hypothesis')) methodMaterials.push({ id: 'method-hypothesis-sheet', title: 'Матрица проверки гипотез', purpose: 'Сопоставление предположений с подтверждающими и опровергающими данными.', source: 'Шаблон выбранного приёма', ready: false });
  if (techniqueIds.has('role-card') || techniqueIds.has('roles')) methodMaterials.push({ id: 'method-role-cards', title: 'Карточки ролей', purpose: 'Распределение ответственности и правил взаимодействия в группе.', source: 'Шаблон выбранного приёма', ready: false });
  return [
    ...fromUmk,
    ...fromCourse,
    ...methodMaterials,
    { id: 'teacher-working-sheet', title: 'Рабочий лист к проблемному вопросу', purpose: `Фиксация гипотез и аргументов для ответа на вопрос «${problemQuestion}».`, source: 'Авторский материал учителя', ready: false },
    { id: 'teacher-exit-ticket', title: 'Лист рефлексии и выходной билет', purpose: `Проверка достижения результата: «${outcome}».`, source: 'Сформировано из утверждённого результата урока', ready: false }
  ];
}
