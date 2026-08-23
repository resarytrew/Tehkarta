import { approvedValue, type Course, type Lesson } from '@tehkarta/domain';
import type { Clock, RequestContext } from '@tehkarta/ports';
import {
  ApplicationError,
  type CourseRepository,
  type LessonRepository
} from './index.js';
import type {
  AiProposalCandidate,
  LessonAiProposal
} from './ai-proposals.js';

export interface ClaimedAsyncJob {
  id: string;
  workspaceId: string;
  jobType: string;
  schemaVersion: string;
  payload: Readonly<Record<string, unknown>>;
  requestedBy: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface AsyncJobProcessingRepository {
  claimNext(input: {
    workerId: string;
    jobType: string;
    now: string;
  }): Promise<ClaimedAsyncJob | null>;
  succeed(input: {
    jobId: string;
    workerId: string;
    now: string;
    result: Readonly<Record<string, unknown>>;
  }): Promise<void>;
  fail(input: {
    jobId: string;
    workerId: string;
    now: string;
    error: Readonly<Record<string, unknown>>;
    retryable: boolean;
    retryAt?: string;
  }): Promise<void>;
}

export interface LessonAiProposalProcessingRepository {
  getById(context: RequestContext, proposalId: string): Promise<LessonAiProposal | null>;
  markRunning(
    context: RequestContext,
    input: { proposalId: string; now: string }
  ): Promise<LessonAiProposal>;
  markReady(
    context: RequestContext,
    input: {
      proposalId: string;
      candidates: AiProposalCandidate[];
      provider: string;
      model: string;
      promptVersion: string;
      routingPolicyVersion: string;
      now: string;
    }
  ): Promise<LessonAiProposal>;
  markQueuedForRetry(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonAiProposal>;
  markStale(
    context: RequestContext,
    input: { proposalId: string; now: string; reason: string }
  ): Promise<LessonAiProposal>;
  markFailed(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonAiProposal>;
}

export interface ApprovedProposalGenerationContext {
  course: {
    id: string;
    subject: string;
    grade: number;
    academicYear: string;
    title: string;
    contentPackId: string;
    contentPackVersion: string;
    curriculumPackId: string;
    curriculumPackVersion: string;
  };
  section: {
    id: string;
    title: string;
    plannedHours: number;
  };
  lesson: {
    id: string;
    title: string;
    durationMinutes: number;
    order: number;
    designFreedom: Lesson['designFreedom'];
  };
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

export interface ProposalGenerationResult {
  candidates: AiProposalCandidate[];
  provider: string;
  model: string;
  promptVersion: string;
  routingPolicyVersion: string;
}

export interface LessonDecisionProposalGenerator {
  generate(input: {
    proposal: LessonAiProposal;
    targetValue?: string;
    context: ApprovedProposalGenerationContext;
  }): Promise<ProposalGenerationResult>;
}

function approvedStrings(fields: Lesson['outcomes']): string[] {
  return fields.flatMap((field) => {
    const value = approvedValue(field);
    return value === undefined ? [] : [value];
  });
}

function approvedProfile(lesson: Lesson): Record<string, string> {
  const result: Record<string, string> = {};
  const fields: Array<[string, typeof lesson.pedagogicalProfile.creed]> = [
    ['creed', lesson.pedagogicalProfile.creed],
    ['style', lesson.pedagogicalProfile.style],
    ['communicationTone', lesson.pedagogicalProfile.communicationTone],
    ['focus', lesson.pedagogicalProfile.focus],
    ['technology', lesson.pedagogicalProfile.technology]
  ];

  for (const [key, field] of fields) {
    const value = approvedValue(field);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function buildApprovedProposalContext(
  course: Course,
  lesson: Lesson
): ApprovedProposalGenerationContext {
  const section = course.sections.find((item) => item.id === lesson.sectionId);
  if (!section) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      `Lesson ${lesson.id} points to section ${lesson.sectionId}, which is absent from the course.`
    );
  }

  const context: ApprovedProposalGenerationContext = {
    course: {
      id: course.id,
      subject: course.subject,
      grade: course.grade,
      academicYear: course.academicYear,
      title: course.title,
      contentPackId: course.contentPackId,
      contentPackVersion: course.contentPackVersion,
      curriculumPackId: course.curriculumPackId,
      curriculumPackVersion: course.curriculumPackVersion
    },
    section: {
      id: section.id,
      title: section.title,
      plannedHours: section.plannedHours
    },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      order: lesson.order,
      designFreedom: lesson.designFreedom
    },
    approvedPedagogicalProfile: approvedProfile(lesson),
    approvedOutcomes: approvedStrings(lesson.outcomes),
    approvedMethods: approvedStrings(lesson.selectedMethods),
    approvedTechniques: approvedStrings(lesson.selectedTechniques),
    approvedForms: approvedStrings(lesson.selectedForms),
    approvedContentItems: approvedStrings(lesson.contentItems)
  };

  const goal = approvedValue(lesson.goal);
  const problemQuestion = approvedValue(lesson.problemQuestion);
  const bigIdea = approvedValue(lesson.bigIdea);
  if (goal !== undefined) context.approvedGoal = goal;
  if (problemQuestion !== undefined) context.approvedProblemQuestion = problemQuestion;
  if (bigIdea !== undefined) context.approvedBigIdea = bigIdea;

  return context;
}

function currentTargetField(lesson: Lesson, proposal: LessonAiProposal) {
  return lesson[proposal.semanticKey];
}

export function proposalIsStale(
  proposal: LessonAiProposal,
  lesson: Lesson
): { stale: boolean; reason?: string } {
  if (lesson.version !== proposal.requestedLessonVersion) {
    return {
      stale: true,
      reason: `Lesson version changed from ${proposal.requestedLessonVersion} to ${lesson.version}.`
    };
  }

  if (proposal.baseDecisionId || proposal.baseRevision !== undefined) {
    const field = currentTargetField(lesson, proposal);
    if (!field) {
      return { stale: true, reason: 'The target teacher decision no longer exists.' };
    }
    if (
      field.fieldId !== proposal.baseDecisionId ||
      field.meta.revision !== proposal.baseRevision
    ) {
      return {
        stale: true,
        reason: 'The target teacher decision changed after the AI request was queued.'
      };
    }
  }

  return { stale: false };
}

function validateGeneratedCandidates(
  proposal: LessonAiProposal,
  candidates: AiProposalCandidate[]
): AiProposalCandidate[] {
  if (candidates.length !== proposal.candidateCountRequested) {
    throw new ApplicationError(
      'EXTERNAL_SERVICE_FAILED',
      `AI returned ${candidates.length} candidates; ${proposal.candidateCountRequested} were requested.`
    );
  }

  const ids = new Set<string>();
  return candidates.map((candidate, index) => {
    const id = candidate.id.trim();
    const value = candidate.value.trim();
    const rationale = candidate.rationale.trim();
    const distinction = candidate.distinction?.trim();

    if (!id || ids.has(id)) {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI candidate ${index + 1} has a missing or duplicate id.`
      );
    }
    if (value.length < 3 || value.length > 4_000) {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI candidate ${index + 1} has an invalid value length.`
      );
    }
    if (rationale.length < 3 || rationale.length > 2_000) {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI candidate ${index + 1} has an invalid rationale length.`
      );
    }

    ids.add(id);
    return {
      id,
      value,
      rationale,
      ...(distinction ? { distinction } : {})
    };
  });
}

export interface ProcessLessonDecisionProposalDependencies {
  lessons: LessonRepository;
  courses: CourseRepository;
  proposals: LessonAiProposalProcessingRepository;
  generator: LessonDecisionProposalGenerator;
  clock: Clock;
}

/**
 * Executes one already-claimed proposal job. The processor never writes to
 * lesson_decisions. It either produces a separate READY proposal or marks it
 * STALE if teacher state moved. Generation failures are intentionally left for
 * the queue runner to classify as retryable or terminal.
 */
export class ProcessLessonDecisionProposal {
  constructor(private readonly deps: ProcessLessonDecisionProposalDependencies) {}

  async execute(
    context: RequestContext,
    proposalId: string
  ): Promise<LessonAiProposal> {
    const proposal = await this.deps.proposals.getById(context, proposalId);
    if (!proposal) {
      throw new ApplicationError('NOT_FOUND', `AI proposal ${proposalId} was not found.`);
    }

    if (proposal.status === 'READY' || proposal.status === 'STALE') return proposal;
    if (proposal.status !== 'QUEUED' && proposal.status !== 'RUNNING') {
      throw new ApplicationError(
        'CONFLICT',
        `AI proposal ${proposal.id} cannot be processed from status ${proposal.status}.`
      );
    }

    const lesson = await this.deps.lessons.getById(context, proposal.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${proposal.lessonId} was not found.`);
    }

    const stale = proposalIsStale(proposal, lesson);
    const now = this.deps.clock.now().toISOString();
    if (stale.stale) {
      return this.deps.proposals.markStale(context, {
        proposalId: proposal.id,
        now,
        reason: stale.reason ?? 'Teacher state changed.'
      });
    }

    const course = await this.deps.courses.getById(context, lesson.courseId);
    if (!course) {
      throw new ApplicationError('NOT_FOUND', `Course ${lesson.courseId} was not found.`);
    }

    await this.deps.proposals.markRunning(context, { proposalId: proposal.id, now });

    const targetValue = currentTargetField(lesson, proposal)?.value;
    const generated = await this.deps.generator.generate({
      proposal,
      ...(targetValue !== undefined ? { targetValue } : {}),
      context: buildApprovedProposalContext(course, lesson)
    });
    const candidates = validateGeneratedCandidates(proposal, generated.candidates);

    return this.deps.proposals.markReady(context, {
      proposalId: proposal.id,
      candidates,
      provider: generated.provider,
      model: generated.model,
      promptVersion: generated.promptVersion,
      routingPolicyVersion: generated.routingPolicyVersion,
      now: this.deps.clock.now().toISOString()
    });
  }
}

function processingError(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'UNEXPECTED_GENERATION_ERROR',
    message: error instanceof Error ? error.message : 'Unknown generation error.'
  };
}

function isRetryableProcessingError(error: unknown): boolean {
  if (!(error instanceof ApplicationError)) return true;
  return error.code === 'EXTERNAL_SERVICE_FAILED';
}

function retryTime(now: Date, attemptCount: number): string {
  const seconds = Math.min(300, 15 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function workerContext(job: ClaimedAsyncJob): RequestContext {
  return {
    requestId: `worker:${job.id}:attempt:${job.attemptCount}`,
    workspaceId: job.workspaceId,
    actorUserId: job.requestedBy,
    roles: ['SYSTEM_WORKER'],
    permissions: []
  };
}

export type ProposalWorkerRunResult =
  | { status: 'IDLE' }
  | { status: 'PROCESSED'; jobId: string; proposalId: string; proposalStatus: string }
  | { status: 'RETRY_SCHEDULED'; jobId: string; proposalId?: string }
  | { status: 'FAILED'; jobId: string; proposalId?: string };

export interface RunNextLessonDecisionProposalJobDependencies {
  jobs: AsyncJobProcessingRepository;
  proposals: LessonAiProposalProcessingRepository;
  processor: ProcessLessonDecisionProposal;
  clock: Clock;
}

/**
 * Claims and executes at most one job. This is deliberately one-shot so the
 * deployment layer can decide whether to invoke it from a long-running worker,
 * a scheduler, or a message-driven container without changing domain behavior.
 */
export class RunNextLessonDecisionProposalJob {
  constructor(private readonly deps: RunNextLessonDecisionProposalJobDependencies) {}

  async execute(workerId: string): Promise<ProposalWorkerRunResult> {
    const claimedAt = this.deps.clock.now();
    const job = await this.deps.jobs.claimNext({
      workerId,
      jobType: 'LESSON_DECISION_PROPOSAL',
      now: claimedAt.toISOString()
    });
    if (!job) return { status: 'IDLE' };

    const rawProposalId = job.payload.proposalId;
    const proposalId = typeof rawProposalId === 'string' ? rawProposalId : undefined;
    const context = workerContext(job);

    if (!proposalId) {
      const error = {
        code: 'INVALID_JOB_PAYLOAD',
        message: 'LESSON_DECISION_PROPOSAL job is missing proposalId.'
      };
      await this.deps.jobs.fail({
        jobId: job.id,
        workerId,
        now: this.deps.clock.now().toISOString(),
        error,
        retryable: false
      });
      return { status: 'FAILED', jobId: job.id };
    }

    try {
      const proposal = await this.deps.processor.execute(context, proposalId);
      await this.deps.jobs.succeed({
        jobId: job.id,
        workerId,
        now: this.deps.clock.now().toISOString(),
        result: { proposalId: proposal.id, proposalStatus: proposal.status }
      });
      return {
        status: 'PROCESSED',
        jobId: job.id,
        proposalId: proposal.id,
        proposalStatus: proposal.status
      };
    } catch (error) {
      const payload = processingError(error);
      const retryable =
        isRetryableProcessingError(error) && job.attemptCount < job.maxAttempts;
      const failedAt = this.deps.clock.now();

      const currentProposal = await this.deps.proposals.getById(context, proposalId);
      if (currentProposal && ['QUEUED', 'RUNNING'].includes(currentProposal.status)) {
        if (retryable) {
          await this.deps.proposals.markQueuedForRetry(context, {
            proposalId,
            now: failedAt.toISOString(),
            error: payload
          });
        } else {
          await this.deps.proposals.markFailed(context, {
            proposalId,
            now: failedAt.toISOString(),
            error: payload
          });
        }
      }

      await this.deps.jobs.fail({
        jobId: job.id,
        workerId,
        now: failedAt.toISOString(),
        error: payload,
        retryable,
        ...(retryable ? { retryAt: retryTime(failedAt, job.attemptCount) } : {})
      });

      return retryable
        ? { status: 'RETRY_SCHEDULED', jobId: job.id, proposalId }
        : { status: 'FAILED', jobId: job.id, proposalId };
    }
  }
}
