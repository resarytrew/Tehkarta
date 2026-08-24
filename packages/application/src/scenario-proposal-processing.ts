import type { Clock, RequestContext } from '@tehkarta/ports';
import {
  ApplicationError,
  type AsyncJobProcessingRepository,
  type ClaimedAsyncJob,
  type ProposalWorkerRunResult
} from './index.js';
import type { ApprovedScenarioContext, BuildApprovedScenarioContext } from './scenario-context.js';
import {
  scenarioContextGuard,
  scenarioContextGuardsEqual,
  type LessonScenarioProposal,
  type ScenarioCandidate,
  type ScenarioContentRef,
  type ScenarioProposalStatus
} from './scenario-proposals.js';

export interface LessonScenarioProposalProcessingRepository {
  getById(context: RequestContext, proposalId: string): Promise<LessonScenarioProposal | null>;
  markRunning(
    context: RequestContext,
    input: { proposalId: string; now: string }
  ): Promise<LessonScenarioProposal>;
  markReady(
    context: RequestContext,
    input: {
      proposalId: string;
      candidates: ScenarioCandidate[];
      provider: string;
      model: string;
      promptVersion: string;
      routingPolicyVersion: string;
      now: string;
    }
  ): Promise<LessonScenarioProposal>;
  markQueuedForRetry(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonScenarioProposal>;
  markStale(
    context: RequestContext,
    input: { proposalId: string; now: string; reason: string }
  ): Promise<LessonScenarioProposal>;
  markFailed(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonScenarioProposal>;
}

export interface ScenarioProposalGenerationResult {
  candidates: ScenarioCandidate[];
  taskType: 'SCENARIO_DESIGN';
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

export interface LessonScenarioProposalGenerator {
  generate(input: {
    proposal: LessonScenarioProposal;
    context: ApprovedScenarioContext;
  }): Promise<ScenarioProposalGenerationResult>;
}

export interface ScenarioAiInvocationTraceInput {
  id: string;
  lessonId: string;
  scenarioProposalId: string;
  jobId: string;
  taskType: 'SCENARIO_DESIGN';
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

export interface ScenarioAiInvocationTraceRepository {
  record(context: RequestContext, input: ScenarioAiInvocationTraceInput): Promise<void>;
}

function invalidResponse(message: string): never {
  throw new ApplicationError('EXTERNAL_SERVICE_FAILED', message, {
    retryable: false,
    errorClass: 'INVALID_RESPONSE',
    taskType: 'SCENARIO_DESIGN'
  });
}

function normalizeText(value: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    invalidResponse(`${label} must contain between ${min} and ${max} characters.`);
  }
  return normalized;
}

function normalizeContentRef(
  ref: ScenarioContentRef,
  allowedRp: ReadonlySet<string>,
  allowedUmk: ReadonlySet<string>,
  candidateIndex: number,
  stageIndex: number
): ScenarioContentRef {
  const id = ref.id.trim();
  if (!id) invalidResponse(`Scenario candidate ${candidateIndex} stage ${stageIndex} has an empty content reference.`);
  if (ref.kind === 'RP_REQUIREMENT') {
    if (!allowedRp.has(id)) {
      invalidResponse(
        `Scenario candidate ${candidateIndex} stage ${stageIndex} references RP requirement ${id} outside the approved context.`
      );
    }
    return { kind: 'RP_REQUIREMENT', id };
  }
  if (ref.kind === 'UMK_MAPPING') {
    if (!allowedUmk.has(id)) {
      invalidResponse(
        `Scenario candidate ${candidateIndex} stage ${stageIndex} references UMK mapping ${id} that the teacher did not include.`
      );
    }
    return { kind: 'UMK_MAPPING', id };
  }
  invalidResponse(`Scenario candidate ${candidateIndex} stage ${stageIndex} has an unsupported content reference kind.`);
}

/**
 * Deterministic safety layer applied after structured AI output. It guarantees
 * that a scenario cannot exceed lesson time, introduce unapproved methodology,
 * cite excluded UMK material, or lose mandatory RP coverage.
 */
export function validateScenarioCandidates(
  proposal: LessonScenarioProposal,
  context: ApprovedScenarioContext,
  candidates: ScenarioCandidate[]
): ScenarioCandidate[] {
  if (candidates.length !== proposal.candidateCountRequested) {
    invalidResponse(
      `AI returned ${candidates.length} scenario candidates; ${proposal.candidateCountRequested} were requested.`
    );
  }

  const allowedMethods = new Set(context.methodology.methods);
  const allowedTechniques = new Set(context.methodology.techniques);
  const allowedForms = new Set(context.methodology.forms);
  const allowedRp = new Set(context.content.mandatoryRp.map((item) => item.id));
  const allowedUmk = new Set(context.content.includedUmk.map((item) => item.mappingId));
  const candidateIds = new Set<string>();

  return candidates.map((candidate, candidateOffset) => {
    const candidateIndex = candidateOffset + 1;
    const id = candidate.id.trim();
    if (!id || candidateIds.has(id)) {
      invalidResponse(`Scenario candidate ${candidateIndex} has a missing or duplicate id.`);
    }
    candidateIds.add(id);

    if (candidate.stages.length < 2 || candidate.stages.length > 15) {
      invalidResponse(`Scenario candidate ${candidateIndex} must contain between 2 and 15 stages.`);
    }

    const stageIds = new Set<string>();
    const coveredRp = new Set<string>();
    let totalMinutes = 0;
    const stages = candidate.stages.map((stage, stageOffset) => {
      const stageIndex = stageOffset + 1;
      const stageId = stage.id.trim();
      if (!stageId || stageIds.has(stageId)) {
        invalidResponse(`Scenario candidate ${candidateIndex} has a missing or duplicate stage id.`);
      }
      stageIds.add(stageId);

      if (!Number.isInteger(stage.minutes) || stage.minutes < 1 || stage.minutes > context.lesson.durationMinutes) {
        invalidResponse(`Scenario candidate ${candidateIndex} stage ${stageIndex} has invalid minutes.`);
      }
      totalMinutes += stage.minutes;

      const method = stage.method?.trim();
      if (method && !allowedMethods.has(method)) {
        invalidResponse(
          `Scenario candidate ${candidateIndex} stage ${stageIndex} uses method «${method}» that the teacher did not approve.`
        );
      }

      const techniques = stage.techniques.map((value) => value.trim()).filter(Boolean);
      if (new Set(techniques).size !== techniques.length) {
        invalidResponse(`Scenario candidate ${candidateIndex} stage ${stageIndex} repeats a technique.`);
      }
      for (const technique of techniques) {
        if (!allowedTechniques.has(technique)) {
          invalidResponse(
            `Scenario candidate ${candidateIndex} stage ${stageIndex} uses technique «${technique}» that the teacher did not approve.`
          );
        }
      }

      const form = stage.form?.trim();
      if (form && !allowedForms.has(form)) {
        invalidResponse(
          `Scenario candidate ${candidateIndex} stage ${stageIndex} uses form «${form}» that the teacher did not approve.`
        );
      }

      const contentRefs = stage.contentRefs.map((ref) =>
        normalizeContentRef(ref, allowedRp, allowedUmk, candidateIndex, stageIndex)
      );
      for (const ref of contentRefs) {
        if (ref.kind === 'RP_REQUIREMENT') coveredRp.add(ref.id);
      }

      const evidenceOfLearning = stage.evidenceOfLearning?.trim();
      return {
        id: stageId,
        title: normalizeText(stage.title, `Scenario candidate ${candidateIndex} stage ${stageIndex} title`, 2, 200),
        minutes: stage.minutes,
        teacherAction: normalizeText(
          stage.teacherAction,
          `Scenario candidate ${candidateIndex} stage ${stageIndex} teacherAction`,
          3,
          2_000
        ),
        studentAction: normalizeText(
          stage.studentAction,
          `Scenario candidate ${candidateIndex} stage ${stageIndex} studentAction`,
          3,
          2_000
        ),
        ...(method ? { method } : {}),
        techniques,
        ...(form ? { form } : {}),
        ...(evidenceOfLearning
          ? {
              evidenceOfLearning: normalizeText(
                evidenceOfLearning,
                `Scenario candidate ${candidateIndex} stage ${stageIndex} evidenceOfLearning`,
                3,
                1_500
              )
            }
          : {}),
        contentRefs
      };
    });

    if (totalMinutes !== context.lesson.durationMinutes) {
      invalidResponse(
        `Scenario candidate ${candidateIndex} uses ${totalMinutes} minutes instead of the lesson duration ${context.lesson.durationMinutes}.`
      );
    }

    const missingRp = [...allowedRp].filter((id) => !coveredRp.has(id));
    if (missingRp.length > 0) {
      invalidResponse(
        `Scenario candidate ${candidateIndex} does not cover mandatory RP requirements: ${missingRp.join(', ')}.`
      );
    }

    return {
      id,
      title: normalizeText(candidate.title, `Scenario candidate ${candidateIndex} title`, 3, 300),
      rationale: normalizeText(candidate.rationale, `Scenario candidate ${candidateIndex} rationale`, 3, 3_000),
      stages
    };
  });
}

function startedAt(completedAt: string, latencyMs?: number): string {
  if (latencyMs === undefined || !Number.isFinite(latencyMs) || latencyMs < 0) return completedAt;
  return new Date(new Date(completedAt).getTime() - latencyMs).toISOString();
}

function stringDetail(details: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberDetail(details: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function successTrace(input: {
  proposal: LessonScenarioProposal;
  generated: ScenarioProposalGenerationResult;
  jobId: string;
  attemptCount: number;
  completedAt: string;
}): ScenarioAiInvocationTraceInput {
  return {
    id: `${input.jobId}:attempt:${input.attemptCount}`,
    lessonId: input.proposal.lessonId,
    scenarioProposalId: input.proposal.id,
    jobId: input.jobId,
    taskType: 'SCENARIO_DESIGN',
    provider: input.generated.provider,
    model: input.generated.model,
    promptVersion: input.generated.promptVersion,
    routingPolicyVersion: input.generated.routingPolicyVersion,
    inputHash: input.generated.inputHash,
    status: 'SUCCEEDED',
    startedAt: startedAt(input.completedAt, input.generated.latencyMs),
    completedAt: input.completedAt,
    ...(input.generated.latencyMs !== undefined ? { latencyMs: input.generated.latencyMs } : {}),
    ...(input.generated.inputTokens !== undefined ? { inputTokens: input.generated.inputTokens } : {}),
    ...(input.generated.outputTokens !== undefined ? { outputTokens: input.generated.outputTokens } : {}),
    ...(input.generated.costMicrounits !== undefined ? { costMicrounits: input.generated.costMicrounits } : {}),
    metadata: {
      candidateCountRequested: input.proposal.candidateCountRequested,
      ...(input.generated.providerRequestId ? { providerRequestId: input.generated.providerRequestId } : {})
    }
  };
}

function failureTrace(input: {
  error: unknown;
  proposal: LessonScenarioProposal;
  jobId: string;
  attemptCount: number;
  completedAt: string;
}): ScenarioAiInvocationTraceInput | null {
  if (!(input.error instanceof ApplicationError)) return null;
  const details = input.error.details;
  const provider = stringDetail(details, 'provider');
  const model = stringDetail(details, 'model');
  const promptVersion = stringDetail(details, 'promptVersion');
  const routingPolicyVersion = stringDetail(details, 'routingPolicyVersion');
  const inputHash = stringDetail(details, 'inputHash');
  if (!provider || !model || !promptVersion || !routingPolicyVersion || !inputHash) return null;

  const latencyMs = numberDetail(details, 'latencyMs');
  const errorClass = stringDetail(details, 'errorClass') ?? 'UNKNOWN';
  const providerRequestId = stringDetail(details, 'providerRequestId');
  const statusCode = numberDetail(details, 'statusCode');
  const retryAfterMs = numberDetail(details, 'retryAfterMs');

  return {
    id: `${input.jobId}:attempt:${input.attemptCount}`,
    lessonId: input.proposal.lessonId,
    scenarioProposalId: input.proposal.id,
    jobId: input.jobId,
    taskType: 'SCENARIO_DESIGN',
    provider,
    model,
    promptVersion,
    routingPolicyVersion,
    inputHash,
    status: 'FAILED',
    startedAt: startedAt(input.completedAt, latencyMs),
    completedAt: input.completedAt,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(numberDetail(details, 'inputTokens') !== undefined ? { inputTokens: numberDetail(details, 'inputTokens')! } : {}),
    ...(numberDetail(details, 'outputTokens') !== undefined ? { outputTokens: numberDetail(details, 'outputTokens')! } : {}),
    ...(numberDetail(details, 'costMicrounits') !== undefined ? { costMicrounits: numberDetail(details, 'costMicrounits')! } : {}),
    errorClass,
    metadata: {
      ...(providerRequestId ? { providerRequestId } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {})
    }
  };
}

export interface ProcessLessonScenarioProposalDependencies {
  scenarioContext: BuildApprovedScenarioContext;
  proposals: LessonScenarioProposalProcessingRepository;
  generator: LessonScenarioProposalGenerator;
  clock: Clock;
  invocations?: ScenarioAiInvocationTraceRepository;
}

export class ProcessLessonScenarioProposal {
  constructor(private readonly deps: ProcessLessonScenarioProposalDependencies) {}

  async execute(
    context: RequestContext,
    proposalId: string,
    execution?: { jobId: string; attemptCount: number }
  ): Promise<LessonScenarioProposal> {
    const proposal = await this.deps.proposals.getById(context, proposalId);
    if (!proposal) {
      throw new ApplicationError('NOT_FOUND', `Scenario proposal ${proposalId} was not found.`);
    }
    if (proposal.status === 'READY' || proposal.status === 'STALE') return proposal;
    if (proposal.status !== 'QUEUED' && proposal.status !== 'RUNNING') {
      throw new ApplicationError(
        'CONFLICT',
        `Scenario proposal ${proposal.id} cannot be processed from status ${proposal.status}.`
      );
    }

    const approvedContext = await this.deps.scenarioContext.execute(context, proposal.lessonId);
    const now = this.deps.clock.now().toISOString();
    if (!approvedContext.readiness.canGenerateScenario) {
      return this.deps.proposals.markStale(context, {
        proposalId: proposal.id,
        now,
        reason: `Approved scenario context is no longer ready: ${approvedContext.readiness.missing.join(', ')}.`
      });
    }

    const currentGuard = scenarioContextGuard(approvedContext);
    if (!scenarioContextGuardsEqual(proposal.contextGuard, currentGuard)) {
      return this.deps.proposals.markStale(context, {
        proposalId: proposal.id,
        now,
        reason: 'Teacher-approved lesson or content context changed after scenario generation was requested.'
      });
    }

    await this.deps.proposals.markRunning(context, { proposalId: proposal.id, now });

    let generated: ScenarioProposalGenerationResult;
    try {
      generated = await this.deps.generator.generate({ proposal, context: approvedContext });
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

    const validated = validateScenarioCandidates(proposal, approvedContext, generated.candidates);
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
      candidates: validated,
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
    return {
      code: error.code,
      message: error.message,
      ...(errorClass ? { errorClass } : {}),
      retryable: error.details?.retryable === true
    };
  }
  return {
    code: 'UNEXPECTED_SCENARIO_GENERATION_ERROR',
    message: error instanceof Error ? error.message : 'Unknown scenario generation error.',
    retryable: false
  };
}

function isRetryable(error: unknown): boolean {
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
  const boundedProviderMs =
    providerRetryAfter === undefined ? 0 : Math.min(900_000, Math.max(0, providerRetryAfter));
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

export interface RunNextLessonScenarioProposalJobDependencies {
  jobs: AsyncJobProcessingRepository;
  proposals: LessonScenarioProposalProcessingRepository;
  processor: ProcessLessonScenarioProposal;
  clock: Clock;
}

export class RunNextLessonScenarioProposalJob {
  constructor(private readonly deps: RunNextLessonScenarioProposalJobDependencies) {}

  async execute(workerId: string): Promise<ProposalWorkerRunResult> {
    const job = await this.deps.jobs.claimNext({
      workerId,
      jobType: 'LESSON_SCENARIO_PROPOSAL',
      now: this.deps.clock.now().toISOString()
    });
    if (!job) return { status: 'IDLE' };

    const rawProposalId = job.payload.scenarioProposalId;
    const proposalId = typeof rawProposalId === 'string' ? rawProposalId : undefined;
    const context = workerContext(job);

    if (!proposalId) {
      await this.deps.jobs.fail({
        jobId: job.id,
        workerId,
        now: this.deps.clock.now().toISOString(),
        error: {
          code: 'INVALID_JOB_PAYLOAD',
          message: 'LESSON_SCENARIO_PROPOSAL job is missing scenarioProposalId.'
        },
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
      const retryable = isRetryable(error) && job.attemptCount < job.maxAttempts;
      const failedAt = this.deps.clock.now();
      const current = await this.deps.proposals.getById(context, proposalId);

      if (current && (current.status === 'QUEUED' || current.status === 'RUNNING')) {
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
