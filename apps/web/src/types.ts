import type { ContentFreedom, Course, Lesson, OutcomeKind } from '@tehkarta/domain';

export type { Course, GovernedField, Lesson } from '@tehkarta/domain';

export type CoreDecisionKey = 'goal' | 'problemQuestion' | 'bigIdea';
export type AiProposalAction = 'VARIANTS' | 'REGENERATE' | 'IMPROVE';
export type AiProposalStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'READY'
  | 'APPLIED'
  | 'DISMISSED'
  | 'STALE'
  | 'FAILED'
  | 'CANCELLED';

export interface AiProposalCandidate {
  id: string;
  value: string;
  rationale: string;
  distinction?: string;
}

export interface LessonAiProposal {
  id: string;
  workspaceId: string;
  lessonId: string;
  semanticKey: CoreDecisionKey;
  action: AiProposalAction;
  status: AiProposalStatus;
  baseDecisionId?: string;
  baseRevision?: number;
  requestedLessonVersion: number;
  candidateCountRequested: number;
  teacherInstruction?: string;
  candidates: AiProposalCandidate[];
  asyncJobId: string;
  idempotencyKey: string;
  requestedBy: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  routingPolicyVersion?: string;
  error?: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  appliedCandidateId?: string;
  appliedDecisionId?: string;
  appliedDecisionRevision?: number;
  appliedBy?: string;
  appliedAt?: string;
  dismissedBy?: string;
  dismissedAt?: string;
}

export interface CourseSummary {
  id: string;
  workspaceId: string;
  version: number;
  subject: string;
  grade: number;
  academicYear: string;
  title: string;
  sectionCount: number;
  lessonCount: number;
}

export interface LessonSummary {
  id: string;
  workspaceId: string;
  courseId: string;
  sectionId: string;
  version: number;
  order: number;
  title: string;
  durationMinutes: number;
  state: 'PLANNED' | 'DESIGNING' | 'READY' | 'ARCHIVED';
}

export interface LessonInvalidation {
  id: string;
  lessonId: string;
  sourceDecisionId: string;
  sourceRevision: number;
  affectedSemanticKey: string;
  status: 'STALE' | 'RESOLVED' | 'IGNORED';
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface MethodologyTechnique {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  typicalMinutes: { min: number; max: number };
}

export interface MethodologyForm {
  id: string;
  name: string;
  participantPattern: string;
  constraints: string[];
}

export interface MethodologyRecommendation {
  id: string;
  packRef: { id: string; version: string };
  technology: { id: string; name: string };
  technologyPhase: { id: string; name: string };
  targetOutcome: {
    fieldId: string;
    revision: number;
    value: string;
    inferredKinds: OutcomeKind[];
  };
  method: {
    id: string;
    name: string;
    description: string;
    preparation: string[];
    constraints: string[];
    antiPatterns: string[];
  };
  suggestedTechniques: MethodologyTechnique[];
  compatibleForms: MethodologyForm[];
  rationale: string;
  estimatedMinutes: { min: number; max: number };
  constraintNotes: string[];
}

export interface MethodologyRecommendationBundle {
  pack: {
    id: string;
    version: string;
    title: string;
    technology: {
      id: string;
      name: string;
      description: string;
      antiPatterns: string[];
    };
  };
  recommendations: MethodologyRecommendation[];
}

export type SourceAccessLevel = 'METADATA_ONLY' | 'PREVIEW' | 'FULL';
export type ContentContextScope = 'COURSE' | 'SECTION' | 'LESSON';
export type ContentSelectionState = 'UNDECIDED' | 'INCLUDED' | 'EXCLUDED';
export type ContentSelectionDecision = 'INCLUDED' | 'EXCLUDED';

export interface ContentContextSource {
  sourceId: string;
  sourceVersion: string;
  sourceType: string;
  title: string;
  rightsBasis: string;
  accessLevel: SourceAccessLevel;
  section?: string;
  pageStart?: number;
  pageEnd?: number;
  fragmentHash?: string;
}

export interface LessonCurriculumRequirement {
  id: string;
  code?: string;
  kind: 'CONTENT' | 'OUTCOME' | 'ASSESSMENT' | 'HOURS';
  text: string;
  allocationStage: 'MANDATORY' | 'INTRODUCE' | 'DEVELOP' | 'APPLY' | 'ASSESS';
  allocationScope: ContentContextScope;
  source: ContentContextSource | null;
}

export interface LessonUmkEvidenceItem {
  mappingId: string;
  sourceUnitId: string;
  relationType: 'PRIMARY' | 'SUPPORTING' | 'ASSESSMENT' | 'EXTENSION';
  mappingScope: ContentContextScope;
  resourceType: 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'DIGITAL' | 'OTHER';
  unitType: string;
  title: string;
  sectionRef?: string;
  pages?: string;
  text?: string;
  textRestricted: boolean;
  source: ContentContextSource;
  selection: {
    state: ContentSelectionState;
    revision?: number;
    actorUserId?: string;
    updatedAt?: string;
  };
}

export interface LessonContentContext {
  lessonId: string;
  courseId: string;
  contentMode: ContentFreedom;
  curriculumPack: { id: string; version: string; title: string };
  contentPack: { id: string; version: string; title: string };
  curriculumRequirements: LessonCurriculumRequirement[];
  umkEvidence: LessonUmkEvidenceItem[];
  approvedContentSet: {
    mandatoryRequirementIds: string[];
    includedUmkMappingIds: string[];
    excludedUmkMappingIds: string[];
    undecidedUmkMappingIds: string[];
  };
  aiSupplemental: [];
}

export interface LessonContentSelection {
  id: string;
  workspaceId: string;
  lessonId: string;
  sourceKind: 'UMK';
  sourceRefId: string;
  decision: ContentSelectionDecision;
  revision: number;
  contentPackId: string;
  contentPackVersion: string;
  sourceDocumentId: string;
  sourceDocumentVersion: string;
  sourceUnitId: string;
  titleSnapshot: string;
  contentHash?: string;
  actorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginMembership {
  workspaceId: string;
  role: string;
  permissions: readonly string[];
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  memberships: LoginMembership[];
  csrfToken: string;
  expiresAt: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  workspace: {
    id: string;
    role: string;
    permissions: readonly string[];
  };
}

export interface ApiData<T> {
  data: T;
}

export interface GovernanceResponse {
  data: Lesson;
  invalidations: LessonInvalidation[];
}

export interface ApplyAiProposalResponse extends GovernanceResponse {
  proposal: LessonAiProposal;
}

export interface SetContentSelectionResponse extends GovernanceResponse {
  contentContext: LessonContentContext;
  selection: LessonContentSelection;
  changed: boolean;
}

export interface ApiErrorPayload {
  error?: string;
  code?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  requestId?: string;
}

export interface WorkspaceSnapshot {
  courses: CourseSummary[];
  course: Course | null;
  lessons: LessonSummary[];
  lesson: Lesson | null;
  invalidations: LessonInvalidation[];
  proposals: LessonAiProposal[];
}
