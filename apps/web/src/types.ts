import type { Course, Lesson, OutcomeKind } from '@tehkarta/domain';

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
