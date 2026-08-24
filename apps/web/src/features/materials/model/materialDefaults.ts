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
  return [
    ...fromUmk,
    ...fromCourse,
    { id: 'teacher-working-sheet', title: 'Рабочий лист к проблемному вопросу', purpose: `Фиксация гипотез и аргументов для ответа на вопрос «${problemQuestion}».`, source: 'Авторский материал учителя', ready: false },
    { id: 'teacher-exit-ticket', title: 'Лист рефлексии и выходной билет', purpose: `Проверка достижения результата: «${outcome}».`, source: 'Сформировано из утверждённого результата урока', ready: false }
  ];
}
