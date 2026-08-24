import type { GovernedField, Lesson } from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import type { CoreLessonDecisionKey } from './lesson-governance.js';

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
  semanticKey: CoreLessonDecisionKey;
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

export interface QueueLessonAiProposalInput {
  proposalId: string;
  jobId: string;
  lessonId: string;
  semanticKey: CoreLessonDecisionKey;
  action: AiProposalAction;
  baseDecisionId?: string;
  baseRevision?: number;
  baseValue?: string;
  requestedLessonVersion: number;
  candidateCountRequested: number;
  teacherInstruction?: string;
  idempotencyKey: string;
  requestedAt: string;
}

export interface LessonAiProposalRepository {
  queue(
    context: RequestContext,
    input: QueueLessonAiProposalInput
  ): Promise<LessonAiProposal>;
  listByLesson(
    context: RequestContext,
    lessonId: string,
    semanticKey?: CoreLessonDecisionKey
  ): Promise<LessonAiProposal[]>;
  getById(
    context: RequestContext,
    proposalId: string
  ): Promise<LessonAiProposal | null>;
  dismiss(
    context: RequestContext,
    input: { proposalId: string; dismissedAt: string }
  ): Promise<LessonAiProposal>;
}

function currentDecision(
  lesson: Lesson,
  semanticKey: CoreLessonDecisionKey
): GovernedField<string> | undefined {
  return lesson[semanticKey];
}

function normalizeTeacherInstruction(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > 1_000) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Teacher instruction for an AI proposal must not exceed 1000 characters.'
    );
  }
  return normalized;
}

function candidateCount(action: AiProposalAction, requested: number | undefined): number {
  const fallback = action === 'VARIANTS' ? 3 : 1;
  const value = requested ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'candidateCount must be an integer between 1 and 5.'
    );
  }
  return value;
}

function validateIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'requestKey must contain between 8 and 200 characters.'
    );
  }
  return normalized;
}

export interface AiProposalRequestDependencies {
  lessons: LessonRepository;
  proposals: LessonAiProposalRepository;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Queues an AI proposal without mutating the governed lesson decision.
 * The request captures the target revision as a safety boundary. A worker may
 * later populate proposal candidates, but teacher-approved state stays intact
 * until the teacher explicitly applies a candidate in a separate command.
 */
export class RequestCoreDecisionAiProposal {
  constructor(private readonly deps: AiProposalRequestDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      semanticKey: CoreLessonDecisionKey;
      action: AiProposalAction;
      expectedLessonVersion: number;
      candidateCount?: number;
      teacherInstruction?: string;
      requestKey: string;
    }
  ): Promise<LessonAiProposal> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }

    if (lesson.version !== input.expectedLessonVersion) {
      throw new ApplicationError(
        'STALE_VERSION',
        'Lesson changed before the AI proposal request was accepted.',
        {
          expectedLessonVersion: input.expectedLessonVersion,
          actualLessonVersion: lesson.version
        }
      );
    }

    const current = currentDecision(lesson, input.semanticKey);
    if (input.action === 'IMPROVE' && !current) {
      throw new ApplicationError(
        'VALIDATION_FAILED',
        `Cannot improve ${input.semanticKey} before it has a value.`
      );
    }

    const count = candidateCount(input.action, input.candidateCount);
    const teacherInstruction = normalizeTeacherInstruction(input.teacherInstruction);
    const idempotencyKey = validateIdempotencyKey(input.requestKey);
    const requestedAt = this.deps.clock.now().toISOString();

    const queueInput: QueueLessonAiProposalInput = {
      proposalId: this.deps.ids.generate('proposal'),
      jobId: this.deps.ids.generate('job'),
      lessonId: lesson.id,
      semanticKey: input.semanticKey,
      action: input.action,
      requestedLessonVersion: lesson.version,
      candidateCountRequested: count,
      idempotencyKey,
      requestedAt
    };

    if (current) {
      queueInput.baseDecisionId = current.fieldId;
      queueInput.baseRevision = current.meta.revision;
      queueInput.baseValue = current.value;
    }
    if (teacherInstruction) queueInput.teacherInstruction = teacherInstruction;

    return this.deps.proposals.queue(context, queueInput);
  }
}

export interface AiProposalDismissDependencies {
  lessons: LessonRepository;
  proposals: LessonAiProposalRepository;
  clock: Clock;
}

/**
 * Records an explicit teacher rejection of a READY proposal. Dismissal is a
 * proposal-lifecycle action only: it never mutates lesson_decisions, lesson
 * version or downstream artifacts.
 */
export class DismissLessonAiProposal {
  constructor(private readonly deps: AiProposalDismissDependencies) {}

  async execute(
    context: RequestContext,
    input: { lessonId: string; proposalId: string }
  ): Promise<LessonAiProposal> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }

    const proposal = await this.deps.proposals.getById(context, input.proposalId);
    if (!proposal || proposal.lessonId !== lesson.id) {
      throw new ApplicationError(
        'NOT_FOUND',
        `AI proposal ${input.proposalId} was not found for lesson ${lesson.id}.`
      );
    }

    if (proposal.status === 'DISMISSED') return proposal;
    if (proposal.status !== 'READY') {
      throw new ApplicationError(
        'CONFLICT',
        `Only a READY AI proposal can be dismissed; current status is ${proposal.status}.`,
        { proposalId: proposal.id, currentStatus: proposal.status }
      );
    }

    return this.deps.proposals.dismiss(context, {
      proposalId: proposal.id,
      dismissedAt: this.deps.clock.now().toISOString()
    });
  }
}
