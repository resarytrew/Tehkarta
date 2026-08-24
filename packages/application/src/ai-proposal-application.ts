import type { GovernedField, Lesson } from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import {
  affectedByCoreDecision,
  type AffectedLessonSemanticKey,
  type CoreLessonDecisionKey,
  type LessonInvalidation,
  type LessonInvalidationRepository
} from './lesson-governance.js';
import type {
  AiProposalCandidate,
  LessonAiProposal,
  LessonAiProposalRepository
} from './ai-proposals.js';

export interface ApplyLessonAiProposalCandidateCommitInput {
  proposalId: string;
  candidateId: string;
  lessonId: string;
  semanticKey: CoreLessonDecisionKey;
  expectedLessonVersion: number;
  expectedBaseDecisionId?: string;
  expectedBaseRevision?: number;
  nextDecision: GovernedField<string>;
  affectedSemanticKeys: readonly AffectedLessonSemanticKey[];
  appliedAt: string;
}

export type ApplyLessonAiProposalCandidateCommitResult = 'APPLIED' | 'ALREADY_APPLIED';

/**
 * Transactional persistence boundary for the only operation that may turn an
 * AI proposal into authoritative lesson state. Implementations MUST update the
 * lesson decision, decision history, invalidations and proposal status in one
 * transaction and MUST re-check the proposal/lesson/base revision while locked.
 */
export interface LessonAiProposalApplicationRepository {
  applyCandidate(
    context: RequestContext,
    input: ApplyLessonAiProposalCandidateCommitInput
  ): Promise<ApplyLessonAiProposalCandidateCommitResult>;
}

export interface ApplyLessonAiProposalCandidateDependencies {
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  proposals: LessonAiProposalRepository;
  application: LessonAiProposalApplicationRepository;
  clock: Clock;
  ids: IdGenerator;
}

export interface AppliedLessonAiProposalResult {
  lesson: Lesson;
  proposal: LessonAiProposal;
  invalidations: LessonInvalidation[];
}

function currentDecision(
  lesson: Lesson,
  semanticKey: CoreLessonDecisionKey
): GovernedField<string> | undefined {
  return lesson[semanticKey];
}

function selectedCandidate(
  proposal: LessonAiProposal,
  candidateId: string
): AiProposalCandidate {
  const candidate = proposal.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new ApplicationError('NOT_FOUND', `AI proposal candidate ${candidateId} was not found.`, {
      proposalId: proposal.id,
      candidateId
    });
  }

  const normalized = candidate.value.trim();
  if (normalized.length < 3 || normalized.length > 4_000) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'AI proposal candidate text must contain between 3 and 4000 characters.',
      { proposalId: proposal.id, candidateId }
    );
  }

  return { ...candidate, value: normalized };
}

function assertProposalTargetsCurrentState(
  lesson: Lesson,
  proposal: LessonAiProposal,
  expectedLessonVersion: number
): GovernedField<string> | undefined {
  if (lesson.version !== expectedLessonVersion) {
    throw new ApplicationError(
      'STALE_VERSION',
      'Lesson changed before the AI candidate could be applied.',
      {
        expectedLessonVersion,
        actualLessonVersion: lesson.version,
        proposalId: proposal.id
      }
    );
  }

  if (lesson.version !== proposal.requestedLessonVersion) {
    throw new ApplicationError(
      'DEPENDENCY_STALE',
      'AI proposal was created for an older lesson version and cannot be applied.',
      {
        proposalId: proposal.id,
        proposalLessonVersion: proposal.requestedLessonVersion,
        actualLessonVersion: lesson.version
      }
    );
  }

  const current = currentDecision(lesson, proposal.semanticKey);
  if (proposal.baseDecisionId) {
    if (!current) {
      throw new ApplicationError(
        'DEPENDENCY_STALE',
        'The decision used as the basis for this AI proposal no longer exists.',
        { proposalId: proposal.id, baseDecisionId: proposal.baseDecisionId }
      );
    }
    if (
      current.fieldId !== proposal.baseDecisionId ||
      current.meta.revision !== proposal.baseRevision
    ) {
      throw new ApplicationError(
        'DEPENDENCY_STALE',
        'The decision changed after this AI proposal was requested.',
        {
          proposalId: proposal.id,
          expectedDecisionId: proposal.baseDecisionId,
          expectedRevision: proposal.baseRevision,
          actualDecisionId: current.fieldId,
          actualRevision: current.meta.revision
        }
      );
    }
  } else if (current) {
    throw new ApplicationError(
      'DEPENDENCY_STALE',
      'A decision now exists where this AI proposal expected an empty field.',
      {
        proposalId: proposal.id,
        actualDecisionId: current.fieldId,
        actualRevision: current.meta.revision
      }
    );
  }

  return current;
}

function teacherApprovedCandidate(
  current: GovernedField<string> | undefined,
  candidate: AiProposalCandidate,
  actorUserId: string,
  at: string,
  ids: IdGenerator
): GovernedField<string> {
  return {
    fieldId: current?.fieldId ?? ids.generate('decision'),
    value: candidate.value,
    meta: {
      revision: (current?.meta.revision ?? 0) + 1,
      source: 'TEACHER',
      status: 'APPROVED',
      updatedAt: at,
      updatedBy: actorUserId,
      approvedAt: at,
      approvedBy: actorUserId
    }
  };
}

/**
 * Explicit teacher command. Selecting a candidate in the UI is not enough;
 * only this use case may promote it into authoritative lesson state.
 */
export class ApplyLessonAiProposalCandidate {
  constructor(private readonly deps: ApplyLessonAiProposalCandidateDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      proposalId: string;
      candidateId: string;
      expectedLessonVersion: number;
    }
  ): Promise<AppliedLessonAiProposalResult> {
    const proposal = await this.deps.proposals.getById(context, input.proposalId);
    if (!proposal || proposal.lessonId !== input.lessonId) {
      throw new ApplicationError('NOT_FOUND', `AI proposal ${input.proposalId} was not found.`);
    }

    if (proposal.status === 'APPLIED') {
      if (proposal.appliedCandidateId !== input.candidateId) {
        throw new ApplicationError(
          'CONFLICT',
          'This AI proposal was already applied using a different candidate.',
          {
            proposalId: proposal.id,
            appliedCandidateId: proposal.appliedCandidateId,
            requestedCandidateId: input.candidateId
          }
        );
      }
      return this.snapshot(context, input.lessonId, proposal.id);
    }

    if (proposal.status !== 'READY') {
      throw new ApplicationError(
        'CONFLICT',
        `AI proposal ${proposal.id} cannot be applied from status ${proposal.status}.`,
        { proposalId: proposal.id, status: proposal.status }
      );
    }

    const candidate = selectedCandidate(proposal, input.candidateId);
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }

    const current = assertProposalTargetsCurrentState(
      lesson,
      proposal,
      input.expectedLessonVersion
    );
    const appliedAt = this.deps.clock.now().toISOString();
    const nextDecision = teacherApprovedCandidate(
      current,
      candidate,
      context.actorUserId,
      appliedAt,
      this.deps.ids
    );

    const commit: ApplyLessonAiProposalCandidateCommitInput = {
      proposalId: proposal.id,
      candidateId: candidate.id,
      lessonId: lesson.id,
      semanticKey: proposal.semanticKey,
      expectedLessonVersion: input.expectedLessonVersion,
      nextDecision,
      affectedSemanticKeys: affectedByCoreDecision(proposal.semanticKey),
      appliedAt
    };
    if (proposal.baseDecisionId) commit.expectedBaseDecisionId = proposal.baseDecisionId;
    if (proposal.baseRevision !== undefined) commit.expectedBaseRevision = proposal.baseRevision;

    await this.deps.application.applyCandidate(context, commit);
    return this.snapshot(context, lesson.id, proposal.id);
  }

  private async snapshot(
    context: RequestContext,
    lessonId: string,
    proposalId: string
  ): Promise<AppliedLessonAiProposalResult> {
    const [lesson, proposal, invalidations] = await Promise.all([
      this.deps.lessons.getById(context, lessonId),
      this.deps.proposals.getById(context, proposalId),
      this.deps.invalidations.listOpen(context, lessonId)
    ]);

    if (!lesson || !proposal) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Applied AI proposal state could not be reloaded after commit.'
      );
    }

    return { lesson, proposal, invalidations };
  }
}
