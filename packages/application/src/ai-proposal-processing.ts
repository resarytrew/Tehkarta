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
import type { ApprovedCourseLessonContext, CoursePlanningRepository } from './course-planning.js';

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

export interface AiInvocationTraceInput {
  id: string;
  lessonId: string;
  proposalId: string;
  jobId: string;
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  routingPolicyVersion: string;
  inputHash: string;
  status: 'SUCCEEDED' | 'FAILED';
  startedAt: string;
  completedAt: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costMicrounits?: number;
  errorClass?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AiInvocationTraceRepository {
  record(context: RequestContext, input: AiInvocationTraceInput): Promise<void>;
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
  approvedPedagogicalTechnology?: {
    technologyId: string;
    name: string;
    methodologyPackId: string;
    methodologyPackVersion: string;
    revision: number;
  };
  approvedGoal?: string;
  approvedProblemQuestion?: string;
  approvedBigIdea?: string;
  approvedOutcomes: string[];
  approvedMethods: string[];
  approvedTechniques: string[];
  approvedForms: string[];
  approvedContentItems: string[];
  coursePlanning?: ApprovedCourseLessonContext;
}

export interface ProposalGenerationResult {
  candidates: AiProposalCandidate[];
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  routingPolicyVersion: string;
  inputHash: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costMicrounits?: number;
  providerRequestId?: string;
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
    ['focus', lesson.pedagogicalProfile.focus]
  ];

  for (const [key, field] of fields) {
    const value = approvedValue(field);
    if (value !== undefined) result[key] = String(value);
  }
  return result;
}

function approvedNames<T extends { name: string }>(fields: Array<import('@tehkarta/domain').GovernedField<T>>): string[] {
  return fields.flatMap((field) => field.meta.status === 'APPROVED' ? [field.value.name] : []);
}

export function buildApprovedProposalContext(
  course: Course,
  lesson: Lesson,
  coursePlanning?: ApprovedCourseLessonContext
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
    ...(approvedValue(lesson.pedagogicalTechnology) ? {
      approvedPedagogicalTechnology: {
        ...approvedValue(lesson.pedagogicalTechnology)!,
        revision: lesson.pedagogicalTechnology!.meta.revision
      }
    } : {}),
    approvedOutcomes: approvedStrings(lesson.outcomes),
    approvedMethods: approvedNames(lesson.selectedMethods),
    approvedTechniques: approvedNames(lesson.selectedTechniques),
    approvedForms: approvedNames(lesson.selectedForms),
    approvedContentItems: approvedStrings(lesson.contentItems),
    ...(coursePlanning ? { coursePlanning } : {})
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
      `AI returned ${candidates.length} candidates; ${proposal.candidateCountRequested} were requested.`,
      { retryable: false, errorClass: 'INVALID_RESPONSE' }
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
        `AI candidate ${index + 1} has a missing or duplicate id.`,
        { retryable: false, errorClass: 'INVALID_RESPONSE' }
      );
    }
    if (value.length < 3 || value.length > 4_000) {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI candidate ${index + 1} has an invalid value length.`,
        { retryable: false, errorClass: 'INVALID_RESPONSE' }
      );
    }
    if (rationale.length < 3 || rationale.length > 2_000) {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI candidate ${index + 1} has an invalid rationale length.`,
        { retryable: false, errorClass: 'INVALID_RESPONSE' }
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

function startedAt(completedAt: string, latencyMs?: number): string {
  if (latencyMs === undefined || !Number.isFinite(latencyMs) || latencyMs < 0) return completedAt;
  return new Date(new Date(completedAt).getTime() - latencyMs).toISOString();
}

function stringDetail(
  details: Readonly<Record<string, unknown>> | undefined,
  key: string
): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberDetail(
  details: Readonly<Record<string, unknown>> | undefined,
  key: string
): number | undefined {
  const value = details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function successTrace(input: {
  proposal: LessonAiProposal;
  generated: ProposalGenerationResult;
  jobId: string;
  attemptCount: number;
  completedAt: string;
}): AiInvocationTraceInput {
  return {
    id: `${input.jobId}:attempt:${input.attemptCount}`,
    lessonId: input.proposal.lessonId,
    proposalId: input.proposal.id,
    jobId: input.jobId,
    taskType: input.generated.taskType,
    provider: input.generated.provider,
    model: input.generated.model,
    promptVersion: input.generated.promptVersion,
    routingPolicyVersion: input.generated.routingPolicyVersion,
    inputHash: input.generated.inputHash,
    status: 'SUCCEEDED',
    startedAt: startedAt(input.completedAt, input.generated.latencyMs),
    completedAt: input.completedAt,
    ...(input.generated.latencyMs !== undefined ? { latencyMs: input.generated.latencyMs } : {}),
    ...(input.generated.inputTokens !== undefined
      ? { inputTokens: input.generated.inputTokens }
      : {}),
    ...(input.generated.outputTokens !== undefined
      ? { outputTokens: input.generated.outputTokens }
      : {}),
    ...(input.generated.costMicrounits !== undefined
      ? { costMicrounits: input.generated.costMicrounits }
      : {}),
    metadata: {
      action: input.proposal.action,
      semanticKey: input.proposal.semanticKey,
      candidateCountRequested: input.proposal.candidateCountRequested,
      ...(input.generated.providerRequestId
        ? { providerRequestId: input.generated.providerRequestId }
        : {})
    }
  };
}

function failureTrace(input: {
  error: unknown;
  proposal: LessonAiProposal;
  jobId: string;
  attemptCount: number;
  completedAt: string;
}): AiInvocationTraceInput | null {
  if (!(input.error instanceof ApplicationError)) return null;
  const details = input.error.details;
  const provider = stringDetail(details, 'provider');
  const model = stringDetail(details, 'model');
  const promptVersion = stringDetail(details, 'promptVersion');
  const routingPolicyVersion = stringDetail(details, 'routingPolicyVersion');
  const inputHash = stringDetail(details, 'inputHash');
  const taskType = stringDetail(details, 'taskType');
  if (!provider || !model || !promptVersion || !routingPolicyVersion || !inputHash || !taskType) {
    return null;
  }

  const latencyMs = numberDetail(details, 'latencyMs');
  const errorClass = stringDetail(details, 'errorClass') ?? 'UNKNOWN';
  const providerRequestId = stringDetail(details, 'providerRequestId');
  const statusCode = numberDetail(details, 'statusCode');
  const retryAfterMs = numberDetail(details, 'retryAfterMs');
  const inputTokens = numberDetail(details, 'inputTokens');
  const outputTokens = numberDetail(details, 'outputTokens');
  const costMicrounits = numberDetail(details, 'costMicrounits');

  return {
    id: `${input.jobId}:attempt:${input.attemptCount}`,
    lessonId: input.proposal.lessonId,
    proposalId: input.proposal.id,
    jobId: input.jobId,
    taskType,
    provider,
    model,
    promptVersion,
    routingPolicyVersion,
    inputHash,
    status: 'FAILED',
    startedAt: startedAt(input.completedAt, latencyMs),
    completedAt: input.completedAt,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(costMicrounits !== undefined ? { costMicrounits } : {}),
    errorClass,
    metadata: {
      action: input.proposal.action,
      semanticKey: input.proposal.semanticKey,
      ...(providerRequestId ? { providerRequestId } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {})
    }
  };
}

export interface ProcessLessonDecisionProposalDependencies {
  lessons: LessonRepository;
  courses: CourseRepository;
  proposals: LessonAiProposalProcessingRepository;
  generator: LessonDecisionProposalGenerator;
  clock: Clock;
  invocations?: AiInvocationTraceRepository;
  coursePlanning?: CoursePlanningRepository;
}

/**
 * Executes one already-claimed proposal job. The processor never writes to
 * lesson_decisions. It either produces a separate READY proposal or marks it
 * STALE if teacher state moved.
 */
export class ProcessLessonDecisionProposal {
  constructor(private readonly deps: ProcessLessonDecisionProposalDependencies) {}

  async execute(
    context: RequestContext,
    proposalId: string,
    execution?: { jobId: string; attemptCount: number }
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

    const coursePlanning = this.deps.coursePlanning
      ? await this.deps.coursePlanning.getApprovedLessonContext(context, course.id, lesson.id)
      : null;

    const targetValue = currentTargetField(lesson, proposal)?.value;
    let generated: ProposalGenerationResult;
    try {
      generated = await this.deps.generator.generate({
        proposal,
        ...(targetValue !== undefined ? { targetValue } : {}),
        context: buildApprovedProposalContext(course, lesson, coursePlanning ?? undefined)
      });
    } catch (error) {
      if (this.deps.invocations && execution) {
        const completedAt = this.deps.clock.now().toISOString();
        const trace = failureTrace({
          error,
          proposal,
          jobId: execution.jobId,
          attemptCount: execution.attemptCount,
          completedAt
        });
        if (trace) await this.deps.invocations.record(context, trace);
      }
      throw error;
    }

    const candidates = validateGeneratedCandidates(proposal, generated.candidates);
    if (this.deps.invocations && execution) {
      const completedAt = this.deps.clock.now().toISOString();
      await this.deps.invocations.record(
        context,
        successTrace({
          proposal,
          generated,
          jobId: execution.jobId,
          attemptCount: execution.attemptCount,
          completedAt
        })
      );
    }

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
    const errorClass = stringDetail(error.details, 'errorClass');
    const retryable = error.details?.retryable === true;
    return {
      code: error.code,
      message: error.message,
      ...(errorClass ? { errorClass } : {}),
      retryable
    };
  }
  return {
    code: 'UNEXPECTED_GENERATION_ERROR',
    message: error instanceof Error ? error.message : 'Unknown generation error.',
    retryable: false
  };
}

function isRetryableProcessingError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    error.code === 'EXTERNAL_SERVICE_FAILED' &&
    error.details?.retryable === true
  );
}

function retryTime(now: Date, attemptCount: number, error: unknown): string {
  const exponentialMs = Math.min(300_000, 15_000 * 2 ** Math.max(0, attemptCount - 1));
  const providerRetryAfter =
    error instanceof ApplicationError ? numberDetail(error.details, 'retryAfterMs') : undefined;
  const boundedProviderMs = providerRetryAfter === undefined
    ? 0
    : Math.min(900_000, Math.max(0, providerRetryAfter));
  return new Date(now.getTime() + Math.max(exponentialMs, boundedProviderMs)).toISOString();
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
      const proposal = await this.deps.processor.execute(context, proposalId, {
        jobId: job.id,
        attemptCount: job.attemptCount
      });
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
        ...(retryable ? { retryAt: retryTime(failedAt, job.attemptCount, error) } : {})
      });

      return retryable
        ? { status: 'RETRY_SCHEDULED', jobId: job.id, proposalId }
        : { status: 'FAILED', jobId: job.id, proposalId };
    }
  }
}
