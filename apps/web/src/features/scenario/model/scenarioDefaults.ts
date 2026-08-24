import type { ApprovedScenarioContext, ScenarioStage } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';

export const missingScenarioLabels: Record<string, string> = {
  GOAL: 'утверждённая цель',
  PROBLEM_QUESTION: 'проблемный вопрос',
  OUTCOME: 'результат урока',
  METHOD: 'выбранный метод',
  CURRICULUM_CORE: 'требования рабочей программы',
  UMK_MAPPING: 'материалы УМК',
  CONTENT_SELECTION: 'решения по всем материалам УМК',
  COURSE_PLAN: 'утверждённый план курса и источники'
  ,BIG_IDEA: 'утверждённая большая идея'
  ,PEDAGOGICAL_PROFILE: 'утверждённый педагогический профиль'
  ,TECHNOLOGY: 'утверждённая педагогическая технология'
  ,FORM: 'выбранная организационная форма'
};

export function scenarioDefaults(lesson: Lesson, context: ApprovedScenarioContext | null): ScenarioStage[] {
  const researchMinutes = Math.max(5, lesson.durationMinutes - 25);
  const goal = context?.concept.goal ?? 'достичь цели урока';
  const problemQuestion = context?.concept.problemQuestion ?? 'ответить на проблемный вопрос';
  const bigIdea = context?.concept.bigIdea ?? 'сформулировать смысловой вывод';
  const outcome = context?.outcomes[0] ?? 'представить обоснованный результат';
  const methods = context?.methodology.methods.join(', ') || 'исследовательская работа';
  const techniques = context?.methodology.techniques.join(', ') || 'анализ и обсуждение';
  const content = [
    ...(context?.content.mandatoryRp.map((item) => item.text) ?? []),
    ...(context?.content.includedUmk.map((item) => item.title) ?? [])
  ].slice(0, 3).join('; ') || 'утверждённое содержание урока';
  const masteredConcepts = context?.coursePlanning?.previousLessons.flatMap((item) => item.concepts).slice(0, 8) ?? [];
  const previousTopics = context?.coursePlanning?.previousLessons.map((item) => item.topic).slice(-2) ?? [];
  const currentConcepts = context?.coursePlanning?.currentLesson?.concepts ?? [];
  const nextTopic = context?.coursePlanning?.nextLessons[0]?.topic;
  const sourceTitles = [...new Set(context?.coursePlanning?.sourceFragments.map((item) => item.sourceTitle) ?? [])];
  const continuity = previousTopics.length > 0
    ? ` Актуализирует предыдущие темы: ${previousTopics.join('; ')}${masteredConcepts.length > 0 ? ` и понятия: ${masteredConcepts.join(', ')}` : ''}.`
    : '';
  const courseBridge = nextTopic ? ` Подготавливает переход к следующей теме «${nextTopic}».` : '';
  const phaseBuckets = Array.from({ length: 5 }, () => [] as string[]);
  for (const [index, phase] of (context?.methodology.canonicalPhases ?? []).entries()) {
    phaseBuckets[Math.min(4, Math.floor(index * 5 / Math.max(1, context?.methodology.canonicalPhases.length ?? 1)))]?.push(phase.id);
  }
  return [
    ['Мотивация и вход в тему', 5, `Возвращает к цели: «${goal}» и создаёт учебную ситуацию.${continuity}`, 'Актуализируют уже освоенное и фиксируют вопросы к новой теме.'],
    ['Постановка проблемы', 5, `Предъявляет вопрос: «${problemQuestion}» и критерии ответа.`, 'Формулируют версии и выбирают направление поиска.'],
    [`Исследование · ${methods}`, researchMinutes, `Организует ${methods.toLowerCase()} с опорой на материалы: ${content}${sourceTitles.length > 0 ? `; документы курса: ${sourceTitles.join(', ')}` : ''}.`, `Используют приёмы «${techniques}», осваивают ${currentConcepts.join(', ') || 'новые понятия'}, анализируют содержание и собирают аргументы.`],
    ['Обсуждение и вывод', 10, `Связывает аргументы с большой идеей: «${bigIdea}».`, `Представляют выводы и демонстрируют результат: «${outcome}».`],
    ['Рефлексия', 5, `Возвращает класс к цели «${goal}» и собирает свидетельства результата.${courseBridge}`, `Формулируют итог по вопросу «${problemQuestion}» и связывают его с логикой курса.`]
  ].map(([title, minutes, teacherAction, studentAction], index) => ({
    id: `stage-${index + 1}`,
    title: title as string,
    minutes: minutes as number,
    teacherAction: teacherAction as string,
    studentAction: studentAction as string,
    technologyPhaseIds: phaseBuckets[index] ?? []
  }));
}
