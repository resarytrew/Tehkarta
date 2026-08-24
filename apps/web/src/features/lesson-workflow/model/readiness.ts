import type { ApprovedScenarioContext, LessonDesignArtifact, MaterialsPayload, ScenarioPayload } from '../../../entities/artifact/model.js';
import type { LessonContentContext } from '../../../entities/content/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import { coreDecisionsApproved } from '../../lesson-intent/model/decisionConfig.js';
import { designSteps, type ActiveDesignStep, type DesignStep, type WorkflowStepState } from './steps.js';

export interface WorkflowReadinessInput {
  lesson: Lesson | null;
  content: LessonContentContext | null;
  context: ApprovedScenarioContext | null;
  artifacts: LessonDesignArtifact[];
  expertiseReady: boolean;
}

function artifact<T extends Record<string, unknown>>(artifacts: LessonDesignArtifact[], kind: 'SCENARIO' | 'MATERIALS') {
  return artifacts.find((item) => item.kind === kind) as LessonDesignArtifact<T> | undefined;
}

export function deriveWorkflowStepStates(input: WorkflowReadinessInput): Record<ActiveDesignStep, WorkflowStepState> {
  const { lesson, content, context, artifacts, expertiseReady } = input;
  const coreComplete = Boolean(lesson && coreDecisionsApproved(lesson));
  const profileRevision = lesson ? [
    lesson.pedagogicalProfile.style?.meta.revision ?? 0,
    lesson.pedagogicalProfile.communicationTone?.meta.revision ?? 0,
    lesson.pedagogicalProfile.focus?.meta.revision ?? 0
  ].join('-') : '';
  const profileComplete = Boolean(lesson && [
    lesson.pedagogicalProfile.style,
    lesson.pedagogicalProfile.communicationTone,
    lesson.pedagogicalProfile.focus
  ].every((field) => field?.meta.status === 'APPROVED'));
  const technology = lesson?.pedagogicalTechnology?.meta.status === 'APPROVED'
    ? lesson.pedagogicalTechnology
    : undefined;
  const currentMethodIds = new Set(lesson?.selectedMethods
    .filter((field) => field.meta.status === 'APPROVED'
      && technology
      && field.value.technologyId === technology.value.technologyId
      && field.value.technologyRevision === technology.meta.revision
      && field.value.pedagogicalProfileRevision === profileRevision)
    .map((field) => field.value.methodId) ?? []);
  const hasCurrentForm = lesson?.selectedForms.some((field) => field.meta.status === 'APPROVED'
    && currentMethodIds.has(field.value.methodId)
    && technology
    && field.value.methodologyPackId === technology.value.methodologyPackId
    && field.value.methodologyPackVersion === technology.value.methodologyPackVersion) ?? false;
  const methodologyComplete = profileComplete && Boolean(technology) && currentMethodIds.size > 0 && hasCurrentForm;
  const contentComplete = Boolean(content && content.approvedContentSet.undecidedUmkMappingIds.length === 0);
  const scenario = artifact<ScenarioPayload>(artifacts, 'SCENARIO');
  const materials = artifact<MaterialsPayload>(artifacts, 'MATERIALS');
  const contextRevision = context?.coursePlanning?.contextRevision;
  const scenarioStale = Boolean(scenario && lesson && (
    scenario.payload.generatedFromLessonVersion !== lesson.version
    || (contextRevision && scenario.payload.generatedFromCourseContextRevision !== contextRevision)
  ));
  const materialsStale = Boolean(materials && lesson && (
    materials.payload.generatedFromLessonVersion !== lesson.version
    || materials.payload.generatedFromScenarioRevision !== scenario?.revision
    || (contextRevision && materials.payload.generatedFromCourseContextRevision !== contextRevision)
  ));

  return {
    1: lesson ? 'complete' : 'available',
    2: coreComplete ? 'complete' : 'available',
    3: !coreComplete ? 'locked' : methodologyComplete ? 'complete' : 'available',
    4: !methodologyComplete ? 'locked' : contentComplete ? 'complete' : 'available',
    5: !contentComplete ? 'locked' : scenarioStale ? 'stale' : scenario ? 'complete' : 'available',
    6: !scenario ? 'locked' : scenarioStale || materialsStale ? 'stale' : materials ? 'complete' : 'available',
    7: !materials ? 'locked' : scenarioStale || materialsStale ? 'stale' : expertiseReady ? 'complete' : 'available',
    8: !expertiseReady ? 'locked' : scenarioStale || materialsStale ? 'stale' : 'available'
  };
}

export function buildWorkflowSteps(input: WorkflowReadinessInput): DesignStep[] {
  const states = deriveWorkflowStepStates(input);
  return designSteps.map((step) => ({ ...step, state: states[step.step] }));
}
