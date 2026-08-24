import type { ApprovedCourseLessonContext } from '../course/model.js';
import type { LessonContentContext } from '../content/model.js';

export type LessonDesignArtifactKind = 'SCENARIO' | 'MATERIALS';

export interface LessonDesignArtifact<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  lessonId: string;
  kind: LessonDesignArtifactKind;
  revision: number;
  payload: T;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioStage {
  id: string;
  title: string;
  minutes: number;
  teacherAction: string;
  studentAction: string;
}

export interface ScenarioPayload extends Record<string, unknown> {
  stages: ScenarioStage[];
  generatedFromLessonVersion?: number;
  generatedFromCoursePlanRevision?: number;
  generatedFromCourseContextRevision?: string;
}

export interface LessonMaterialItem {
  id: string;
  title: string;
  purpose: string;
  source?: string;
  ready: boolean;
}

export interface MaterialsPayload extends Record<string, unknown> {
  items: LessonMaterialItem[];
  generatedFromLessonVersion?: number;
  generatedFromScenarioRevision?: number;
  generatedFromCoursePlanRevision?: number;
  generatedFromCourseContextRevision?: string;
}

export interface ApprovedScenarioContext {
  course: { id: string; subject: string; grade: number; academicYear: string; title: string };
  section: { id: string; title: string; plannedHours: number };
  lesson: {
    id: string;
    version: number;
    title: string;
    order: number;
    durationMinutes: number;
    designFreedom: { mode: string; contentFreedom: string; methodFreedom: string };
  };
  concept: { goal?: string; problemQuestion?: string; bigIdea?: string };
  outcomes: string[];
  methodology: { methods: string[]; techniques: string[]; forms: string[] };
  content: {
    mandatoryRp: LessonContentContext['curriculumRequirements'];
    includedUmk: LessonContentContext['umkEvidence'];
  };
  coursePlanning?: ApprovedCourseLessonContext;
  readiness: {
    canGenerateScenario: boolean;
    missing: string[];
    undecidedUmkCount: number;
    excludedUmkCount: number;
  };
}
