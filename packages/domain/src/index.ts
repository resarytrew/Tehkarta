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

import type {
  MethodSelection,
  OrganizationalFormSelection,
  PedagogicalProfile,
  PedagogicalTechnologySelection,
  TechniqueSelection
} from './pedagogy.js';

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
  knowledgeSpaceId?: string;
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
  pedagogicalTechnology?: GovernedField<PedagogicalTechnologySelection>;
  designFreedom: DesignFreedom;
  goal?: GovernedField<string>;
  problemQuestion?: GovernedField<string>;
  bigIdea?: GovernedField<string>;
  outcomes: GovernedField<string>[];
  selectedMethods: GovernedField<MethodSelection>[];
  selectedTechniques: GovernedField<TechniqueSelection>[];
  selectedForms: GovernedField<OrganizationalFormSelection>[];
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

export class ApprovedFieldMutationError extends Error {
  constructor(fieldId: string) {
    super(`Approved field ${fieldId} cannot be replaced by AI without being reopened by the teacher.`);
    this.name = 'ApprovedFieldMutationError';
  }
}

export function approvedValue<T>(field?: GovernedField<T>): T | undefined {
  return field?.meta.status === 'APPROVED' ? field.value : undefined;
}

export function editGovernedField<T>(
  field: GovernedField<T>,
  nextValue: T,
  actorUserId: UserId,
  at: string
): GovernedField<T> {
  return {
    fieldId: field.fieldId,
    value: nextValue,
    meta: {
      revision: field.meta.revision + 1,
      source: 'TEACHER',
      status: 'EDITED',
      updatedAt: at,
      updatedBy: actorUserId
    }
  };
}

export function approveGovernedField<T>(
  field: GovernedField<T>,
  actorUserId: UserId,
  at: string
): GovernedField<T> {
  return {
    fieldId: field.fieldId,
    value: field.value,
    meta: {
      revision: field.meta.revision + 1,
      source: field.meta.source,
      status: 'APPROVED',
      updatedAt: at,
      updatedBy: actorUserId,
      approvedAt: at,
      approvedBy: actorUserId
    }
  };
}

export function replaceWithAiProposal<T>(
  field: GovernedField<T>,
  nextValue: T,
  at: string
): GovernedField<T> {
  if (field.meta.status === 'APPROVED') {
    throw new ApprovedFieldMutationError(field.fieldId);
  }

  return {
    fieldId: field.fieldId,
    value: nextValue,
    meta: {
      revision: field.meta.revision + 1,
      source: 'AI',
      status: 'PROPOSED',
      updatedAt: at
    }
  };
}

export * from './dependencies.js';
export * from './history9.seed.js';
export * from './methodology.js';
export * from './methodology-registry.js';
export * from './pedagogy.js';
