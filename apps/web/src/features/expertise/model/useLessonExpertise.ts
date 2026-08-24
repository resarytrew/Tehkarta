import { useMemo } from 'react';
import type { ApprovedScenarioContext } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { useMaterials } from '../../materials/model/useMaterials.js';
import type { useScenario } from '../../scenario/model/useScenario.js';

export interface ExpertiseCheck { label: string; ok: boolean }

export interface LessonExpertiseDependencies {
  lesson: Lesson | null;
  context: ApprovedScenarioContext | null;
  scenario: ReturnType<typeof useScenario>;
  materials: ReturnType<typeof useMaterials>;
}

export function useLessonExpertise({ lesson, context, scenario, materials }: LessonExpertiseDependencies) {
  const checks = useMemo<ExpertiseCheck[]>(() => {
    if (!lesson) return [];
    return [
      { label: 'Цель, проблемный вопрос и большая идея утверждены', ok: [lesson.goal, lesson.problemQuestion, lesson.bigIdea].every((field) => field?.meta.status === 'APPROVED') },
      { label: 'Есть хотя бы один утверждённый результат', ok: lesson.outcomes.some((field) => field.meta.status === 'APPROVED') },
      { label: 'Выбран и утверждён метод', ok: lesson.selectedMethods.some((field) => field.meta.status === 'APPROVED') },
      { label: 'По всем материалам УМК принято решение', ok: (context?.readiness.undecidedUmkCount ?? 1) === 0 },
      { label: `Сценарий укладывается в ${lesson.durationMinutes} минут`, ok: Boolean(scenario.artifact) && scenario.totalMinutes === lesson.durationMinutes },
      { label: 'Для каждого этапа описаны действия учителя и учеников', ok: Boolean(scenario.artifact) && scenario.stages.every((stage) => Boolean(stage.teacherAction.trim() && stage.studentAction.trim())) },
      { label: 'Сценарий сформирован из актуальных решений урока', ok: scenario.artifact?.payload.generatedFromLessonVersion === lesson.version },
      { label: 'Сценарий учитывает актуальный план и источники курса', ok: Boolean(context?.coursePlanning) && scenario.artifact?.payload.generatedFromCourseContextRevision === context?.coursePlanning?.contextRevision },
      { label: 'Материалы сформированы из актуального сценария', ok: materials.artifact?.payload.generatedFromLessonVersion === lesson.version && materials.artifact?.payload.generatedFromScenarioRevision === scenario.artifact?.revision },
      { label: 'Материалы учитывают актуальный план и источники курса', ok: Boolean(context?.coursePlanning) && materials.artifact?.payload.generatedFromCourseContextRevision === context?.coursePlanning?.contextRevision },
      { label: 'Все материалы подготовлены', ok: Boolean(materials.artifact) && materials.items.length > 0 && materials.items.every((item) => item.ready) }
    ];
  }, [context, lesson, materials.artifact, materials.items, scenario.artifact, scenario.stages, scenario.totalMinutes]);
  const passed = checks.filter((check) => check.ok).length;
  return { checks, passed, total: checks.length, isReady: checks.length > 0 && passed === checks.length };
}
