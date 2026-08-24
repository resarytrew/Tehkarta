import type { GovernanceResponse } from '../lesson/model.js';
import type { CoreDecisionKey } from '../lesson/model.js';

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

export interface ApplyAiProposalResponse extends GovernanceResponse {
  proposal: LessonAiProposal;
}
