export type WorkspaceId = string;
export type UserId = string;

export type ApprovalStatus = 'PROPOSED' | 'EDITED' | 'APPROVED';
export type ValueSource = 'AI' | 'TEACHER' | 'CURRICULUM' | 'UMK' | 'SYSTEM';

export interface RevisionMeta {
  revision: number;
  source: ValueSource;
  status: ApprovalStatus;
  updatedAt: string;
  updatedBy?: UserId;
  approvedAt?: string;
  approvedBy?: UserId;
}

export interface GovernedField<T> {
  fieldId: string;
  value: T;
  meta: RevisionMeta;
}

export interface PedagogicalProfile {
  creed?: GovernedField<string>;
  style?: GovernedField<string>;
  communicationTone?: GovernedField<string>;
  focus?: GovernedField<string>;
  technology?: GovernedField<string>;
}

export type DesignMode = 'REGULATED' | 'BALANCED' | 'CREATIVE';
export type ContentFreedom = 'TEXTBOOK_STRICT' | 'TEXTBOOK_PLUS' | 'EXPANDED';
export type MethodFreedom = 'CLASSIC' | 'FLEXIBLE' | 'EXPERIMENTAL';

export interface DesignFreedom {
  mode: DesignMode;
  contentFreedom: ContentFreedom;
  methodFreedom: MethodFreedom;
}

export interface SourceRef {
  sourceId: string;
  sourceVersion: string;
  sourceType: 'CURRICULUM' | 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'DIGITAL' | 'EXTERNAL';
  title: string;
  section?: string;
  pageStart?: number;
  pageEnd?: number;
  fragmentHash?: string;
}

export interface CurriculumRequirement {
  id: string;
  code?: string;
  text: string;
  kind: 'CONTENT' | 'OUTCOME' | 'ASSESSMENT' | 'HOURS';
  sourceRefs: SourceRef[];
}

export interface UmkEvidence {
  id: string;
  type: 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'DIGITAL';
  title: string;
  sourceRefs: SourceRef[];
  sectionRef?: string;
  pages?: string;
}

export interface Course {
  id: string;
  workspaceId: WorkspaceId;
  version: number;
  subject: string;
  grade: number;
  academicYear: string;
  title: string;
  curriculumPackId: string;
  curriculumPackVersion: string;
  contentPackId: string;
  contentPackVersion: string;
  sections: Section[];
}

export interface Section {
  id: string;
  title: string;
  plannedHours: number;
  lessonIds: string[];
  requirementIds: string[];
}

export interface Lesson {
  id: string;
  workspaceId: WorkspaceId;
  version: number;
  courseId: string;
  sectionId: string;
  order: number;
  title: string;
  durationMinutes: number;
  pedagogicalProfile: PedagogicalProfile;
  designFreedom: DesignFreedom;
  goal?: GovernedField<string>;
  problemQuestion?: GovernedField<string>;
  bigIdea?: GovernedField<string>;
  outcomes: GovernedField<string>[];
  selectedMethods: GovernedField<string>[];
  selectedTechniques: GovernedField<string>[];
  selectedForms: GovernedField<string>[];
  contentItems: GovernedField<string>[];
}

export interface ApprovedLessonContext {
  course: Pick<Course, 'id' | 'workspaceId' | 'version' | 'subject' | 'grade' | 'academicYear' | 'title' | 'curriculumPackId' | 'curriculumPackVersion' | 'contentPackId' | 'contentPackVersion'>;
  section: Pick<Section, 'id' | 'title' | 'plannedHours'>;
  lesson: Pick<Lesson, 'id' | 'workspaceId' | 'version' | 'order' | 'title' | 'durationMinutes' | 'designFreedom'>;
  curriculumRequirements: CurriculumRequirement[];
  umkEvidence: UmkEvidence[];
  approvedPedagogicalProfile: Record<string, string>;
  approvedGoal?: string;
  approvedProblemQuestion?: string;
  approvedBigIdea?: string;
  approvedOutcomes: string[];
  approvedMethods: string[];
  approvedTechniques: string[];
  approvedForms: string[];
  approvedContentItems: string[];
}

export function approvedValue<T>(field?: GovernedField<T>): T | undefined {
  return field?.meta.status === 'APPROVED' ? field.value : undefined;
}

export * from './dependencies.js';
export * from './history9.seed.js';
