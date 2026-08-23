export type ApprovalStatus = 'PROPOSED' | 'EDITED' | 'APPROVED';
export type ValueSource = 'AI' | 'TEACHER' | 'CURRICULUM' | 'UMK' | 'SYSTEM';

export interface RevisionMeta {
  revision: number;
  source: ValueSource;
  status: ApprovalStatus;
  updatedAt: string;
  approvedAt?: string;
}

export interface GovernedField<T> {
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

export interface CurriculumRequirement {
  id: string;
  code?: string;
  text: string;
  kind: 'CONTENT' | 'OUTCOME' | 'ASSESSMENT' | 'HOURS';
  sourceRef: string;
}

export interface UmkEvidence {
  id: string;
  type: 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'DIGITAL';
  title: string;
  sourceRef: string;
  sectionRef?: string;
  pages?: string;
}

export interface Course {
  id: string;
  subject: string;
  grade: number;
  academicYear: string;
  title: string;
  curriculumPackId: string;
  contentPackId: string;
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
  course: Pick<Course, 'id' | 'subject' | 'grade' | 'academicYear' | 'title'>;
  section: Pick<Section, 'id' | 'title' | 'plannedHours'>;
  lesson: Pick<Lesson, 'id' | 'order' | 'title' | 'durationMinutes' | 'designFreedom'>;
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
