import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError } from './index.js';
import type { LessonInvalidation, LessonInvalidationRepository } from './lesson-governance.js';
import type { ApprovedScenarioContext, BuildApprovedScenarioContext } from './scenario-context.js';

export type ScenarioProposalStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'READY'
  | 'APPLIED'
  | 'DISMISSED'
  | 'STALE'
  | 'FAILED'
  | 'CANCELLED';

export type ScenarioContentRefKind = 'RP_REQUIREMENT' | 'UMK_MAPPING';

export interface ScenarioContentRef {
  kind: ScenarioContentRefKind;
  id: string;
}

export interface ScenarioStage {
  id: string;
  title: string;
  minutes: number;
  teacherAction: string;
  studentAction: string;
  method?: string;
  form?: string;
  evidenceOfLearning?: string;
  contentRefs: ScenarioContentRef[];
}

export interface ScenarioCandidate {
  id: string;
  title: string;
  rationale: string;
  stages: ScenarioStage[];
}

export interface ScenarioContextGuard {
  version: 'scenario-context-v1';
  lessonVersion: number;
  curriculumPackId: string;
  curriculumPackVersion: string;
  contentPackId: string;
  contentPackVersion: string;
  mandatoryRequirementIds: string[];
  includedUmkMappingIds: string[];
}

export interface LessonScenarioProposal {
  id: string;
  workspaceId: string;
  lessonId: string;
  status: ScenarioProposalStatus;
  requestedLessonVersion: number;
  contextGuard: ScenarioContextGuard;
  candidateCountRequested: number;
  teacherInstruction?: string;
  candidates: ScenarioCandidate[];
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
  appliedBy?: string;
  appliedAt?: string;
  dismissedBy?: string;
  dismissedAt?: string;
}

export interface LessonScenarioArtifact {
  id: string;
  workspaceId: string;
  lessonId: string;
  revision: number;
  status: 'APPROVED';
  title: string;
  rationale: string;
  stages: ScenarioStage[];
  source: 'TEACHER';
  originKind: 'AI_PROPOSAL' | 'TEACHER';
  originProposalId?: string;
  originCandidateId?: string;
  basedOnLessonVersion: number;
  approvedBy: string;
  approvedAt: string;
  updatedAt: string;
}

export interface QueueLessonScenarioProposalInput {
  proposalId: string;
  jobId: string;
  lessonId: string;
  requestedLessonVersion: number;
  contextGuard: ScenarioContextGuard;
  candidateCountRequested: number;
  teacherInstruction?: string;
  idempotencyKey: string;
  requestedAt: string;
}

export interface LessonScenarioProposalRepository {
  queue(context: RequestContext, input: QueueLessonScenarioProposalInput): Promise<LessonScenarioProposal>;
  listByLesson(context: RequestContext, lessonId: string): Promise<LessonScenarioProposal[]>;
  getById(context: RequestContext, proposalId: string): Promise<LessonScenarioProposal | null>;
  dismiss(
    context: RequestContext,
    input: { proposalId: string; dismissedAt: string }
  ): Promise<LessonScenarioProposal>;
}

export interface LessonScenarioRepository {
  getByLesson(context: RequestContext, lessonId: string): Promise<LessonScenarioArtifact | null>;
}

export interface ApplyLessonScenarioCommitInput {
  proposalId: string;
  lessonId: string;
  candidateId: string;
  expectedLessonVersion: number;
  scenarioId: string;
  appliedAt: string;
  affectedSemanticKeys: readonly string[];
}

export interface ApplyLessonScenarioCommitResult {
  result: 'APPLIED' | 'ALREADY_APPLIED';
  proposal: LessonScenarioProposal;
  scenario: LessonScenarioArtifact;
  lessonVersion: number;
}

export interface LessonScenarioApplicationRepository {
  applyCandidate(
    context: RequestContext,
    input: ApplyLessonScenarioCommitInput
  ): Promise<ApplyLessonScenarioCommitResult>;
}

export function scenarioContextGuard(context: ApprovedScenarioContext): ScenarioContextGuard {
  return {
    version: 'scenario-context-v1',
    lessonVersion: context.lesson.version,
    curriculumPackId: context.sourcePacks.curriculum.id,
    curriculumPackVersion: context.sourcePacks.curriculum.version,
    contentPackId: context.sourcePacks.content.id,
    contentPackVersion: context.sourcePacks.content.version,
    mandatoryRequirementIds: context.content.mandatoryRp.map((item) => item.id).sort(),
    includedUmkMappingIds: context.content.includedUmk.map((item) => item.mappingId).sort()
  };
}

export function scenarioContextGuardsEqual(
  left: ScenarioContextGuard,
  right: ScenarioContextGuard
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function candidateCount(value: number | undefined): number {
  const count = value ?? 2;
  if (!Number.isInteger(count) || count < 1 || count > 3) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Scenario candidateCount must be an integer between 1 and 3.'
    );
  }
  return count;
}

function teacherInstruction(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > 2_000) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Scenario teacherInstruction must not exceed 2000 characters.'
    );
  }
  return normalized;
}

function requestKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Scenario requestKey must contain between 8 and 200 characters.'
    );
  }
  return normalized;
}

export interface RequestLessonScenarioProposalDependencies {
  scenarioContext: BuildApprovedScenarioContext;
  proposals: LessonScenarioProposalRepository;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Queues scenario generation only after the deterministic readiness gate has
 * accepted the current teacher-approved lesson context. No scenario artifact is
 * mutated by this command.
 */
export class RequestLessonScenarioProposal {
  constructor(private readonly deps: RequestLessonScenarioProposalDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      expectedLessonVersion: number;
      candidateCount?: number;
      teacherInstruction?: string;
      requestKey: string;
    }
  ): Promise<LessonScenarioProposal> {
    const approvedContext = await this.deps.scenarioContext.execute(context, input.lessonId);

    if (approvedContext.lesson.version !== input.expectedLessonVersion) {
      throw new ApplicationError(
        'STALE_VERSION',
        'Lesson changed before the scenario request was accepted.',
        {
          expectedLessonVersion: input.expectedLessonVersion,
          actualLessonVersion: approvedContext.lesson.version
        }
      );
    }

    if (!approvedContext.readiness.canGenerateScenario) {
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Scenario generation is blocked until all required teacher decisions are complete.',
        {
          missing: approvedContext.readiness.missing,
          undecidedUmkCount: approvedContext.readiness.undecidedUmkCount
        }
      );
    }

    const count = candidateCount(input.candidateCount);
    const instruction = teacherInstruction(input.teacherInstruction);
    const idempotencyKey = requestKey(input.requestKey);
    const requestedAt = this.deps.clock.now().toISOString();

    return this.deps.proposals.queue(context, {
      proposalId: this.deps.ids.generate('scenario-proposal'),
      jobId: this.deps.ids.generate('job'),
      lessonId: approvedContext.lesson.id,
      requestedLessonVersion: approvedContext.lesson.version,
      contextGuard: scenarioContextGuard(approvedContext),
      candidateCountRequested: count,
      ...(instruction ? { teacherInstruction: instruction } : {}),
      idempotencyKey,
      requestedAt
    });
  }
}

export interface DismissLessonScenarioProposalDependencies {
  proposals: LessonScenarioProposalRepository;
  clock: Clock;
}

export class DismissLessonScenarioProposal {
  constructor(private readonly deps: DismissLessonScenarioProposalDependencies) {}

  async execute(
    context: RequestContext,
    input: { lessonId: string; proposalId: string }
  ): Promise<LessonScenarioProposal> {
    const proposal = await this.deps.proposals.getById(context, input.proposalId);
    if (!proposal || proposal.lessonId !== input.lessonId) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Scenario proposal ${input.proposalId} was not found for lesson ${input.lessonId}.`
      );
    }
    if (proposal.status === 'DISMISSED') return proposal;
    if (proposal.status !== 'READY') {
      throw new ApplicationError(
        'CONFLICT',
        `Only a READY scenario proposal can be dismissed; current status is ${proposal.status}.`
      );
    }

    return this.deps.proposals.dismiss(context, {
      proposalId: proposal.id,
      dismissedAt: this.deps.clock.now().toISOString()
    });
  }
}

const SCENARIO_IMPACT = ['material', 'assessment', 'homework', 'finalConclusion'] as const;

export interface ApplyLessonScenarioProposalCandidateDependencies {
  proposals: LessonScenarioProposalRepository;
  application: LessonScenarioApplicationRepository;
  invalidations: LessonInvalidationRepository;
  clock: Clock;
  ids: IdGenerator;
}

export interface ApplyLessonScenarioProposalCandidateResult {
  proposal: LessonScenarioProposal;
  scenario: LessonScenarioArtifact;
  lessonVersion: number;
  invalidations: LessonInvalidation[];
}

/**
 * Applying an AI scenario is an explicit teacher action. The persistence layer
 * commits the scenario with source=TEACHER and keeps AI provider/model data only
 * as provenance in the immutable revision record.
 */
export class ApplyLessonScenarioProposalCandidate {
  constructor(private readonly deps: ApplyLessonScenarioProposalCandidateDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      proposalId: string;
      candidateId: string;
      expectedLessonVersion: number;
    }
  ): Promise<ApplyLessonScenarioProposalCandidateResult> {
    const proposal = await this.deps.proposals.getById(context, input.proposalId);
    if (!proposal || proposal.lessonId !== input.lessonId) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Scenario proposal ${input.proposalId} was not found for lesson ${input.lessonId}.`
      );
    }
    if (proposal.status !== 'READY' && proposal.status !== 'APPLIED') {
      throw new ApplicationError(
        'CONFLICT',
        `Scenario proposal ${proposal.id} cannot be applied from status ${proposal.status}.`
      );
    }
    if (!proposal.candidates.some((candidate) => candidate.id === input.candidateId)) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Scenario candidate ${input.candidateId} was not found in proposal ${proposal.id}.`
      );
    }

    const committed = await this.deps.application.applyCandidate(context, {
      proposalId: proposal.id,
      lessonId: input.lessonId,
      candidateId: input.candidateId,
      expectedLessonVersion: input.expectedLessonVersion,
      scenarioId: this.deps.ids.generate('scenario'),
      appliedAt: this.deps.clock.now().toISOString(),
      affectedSemanticKeys: SCENARIO_IMPACT
    });

    return {
      proposal: committed.proposal,
      scenario: committed.scenario,
      lessonVersion: committed.lessonVersion,
      invalidations: await this.deps.invalidations.listOpen(context, input.lessonId)
    };
  }
}
