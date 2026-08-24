import {
  ApplicationError,
  type LessonScenarioProposal,
  type LessonScenarioProposalRepository,
  type QueueLessonScenarioProposalInput,
  type ScenarioCandidate,
  type ScenarioContextGuard,
  type ScenarioProposalStatus
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

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

interface ScenarioProposalRow {
  id: string;
  workspace_id: string;
  lesson_id: string;
  status: ScenarioProposalStatus;
  requested_lesson_version: number;
  context_guard_json: unknown;
  candidate_count_requested: number;
  teacher_instruction: string | null;
  candidates_json: unknown;
  async_job_id: string;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  routing_policy_version: string | null;
  idempotency_key: string;
  requested_by: string;
  error_json: unknown;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  applied_candidate_id: string | null;
  applied_by: string | null;
  applied_at: Date | null;
  dismissed_by: string | null;
  dismissed_at: Date | null;
}

const SELECT_COLUMNS = `
  id, workspace_id, lesson_id, status, requested_lesson_version,
  context_guard_json, candidate_count_requested, teacher_instruction,
  candidates_json, async_job_id, provider, model, prompt_version,
  routing_policy_version, idempotency_key, requested_by, error_json,
  created_at, updated_at, completed_at, applied_candidate_id, applied_by,
  applied_at, dismissed_by, dismissed_at
`;

function contextGuard(value: unknown): ScenarioContextGuard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored scenario context guard is invalid.');
  }
  const item = value as Record<string, unknown>;
  if (
    item.version !== 'scenario-context-v1' ||
    typeof item.lessonVersion !== 'number' ||
    typeof item.curriculumPackId !== 'string' ||
    typeof item.curriculumPackVersion !== 'string' ||
    typeof item.contentPackId !== 'string' ||
    typeof item.contentPackVersion !== 'string' ||
    !Array.isArray(item.mandatoryRequirementIds) ||
    !Array.isArray(item.includedUmkMappingIds)
  ) {
    throw new Error('Stored scenario context guard is invalid.');
  }
  if (
    !item.mandatoryRequirementIds.every((value) => typeof value === 'string') ||
    !item.includedUmkMappingIds.every((value) => typeof value === 'string')
  ) {
    throw new Error('Stored scenario context guard contains invalid ids.');
  }
  return {
    version: 'scenario-context-v1',
    lessonVersion: item.lessonVersion,
    curriculumPackId: item.curriculumPackId,
    curriculumPackVersion: item.curriculumPackVersion,
    contentPackId: item.contentPackId,
    contentPackVersion: item.contentPackVersion,
    mandatoryRequirementIds: [...item.mandatoryRequirementIds],
    includedUmkMappingIds: [...item.includedUmkMappingIds]
  };
}

function candidates(value: unknown): ScenarioCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is ScenarioCandidate => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.rationale === 'string' &&
      Array.isArray(item.stages)
    );
  });
}

function errorPayload(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function mapProposal(row: ScenarioProposalRow): LessonScenarioProposal {
  const proposal: LessonScenarioProposal = {
    id: row.id,
    workspaceId: row.workspace_id,
    lessonId: row.lesson_id,
    status: row.status,
    requestedLessonVersion: row.requested_lesson_version,
    contextGuard: contextGuard(row.context_guard_json),
    candidateCountRequested: row.candidate_count_requested,
    candidates: candidates(row.candidates_json),
    asyncJobId: row.async_job_id,
    idempotencyKey: row.idempotency_key,
    requestedBy: row.requested_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
  if (row.teacher_instruction) proposal.teacherInstruction = row.teacher_instruction;
  if (row.provider) proposal.provider = row.provider;
  if (row.model) proposal.model = row.model;
  if (row.prompt_version) proposal.promptVersion = row.prompt_version;
  if (row.routing_policy_version) proposal.routingPolicyVersion = row.routing_policy_version;
  const error = errorPayload(row.error_json);
  if (error) proposal.error = error;
  if (row.completed_at) proposal.completedAt = row.completed_at.toISOString();
  if (row.applied_candidate_id) proposal.appliedCandidateId = row.applied_candidate_id;
  if (row.applied_by) proposal.appliedBy = row.applied_by;
  if (row.applied_at) proposal.appliedAt = row.applied_at.toISOString();
  if (row.dismissed_by) proposal.dismissedBy = row.dismissed_by;
  if (row.dismissed_at) proposal.dismissedAt = row.dismissed_at.toISOString();
  return proposal;
}

async function existingByIdempotency(
  client: PoolClient,
  context: RequestContext,
  idempotencyKey: string
): Promise<LessonScenarioProposal | null> {
  const result = await client.query<ScenarioProposalRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM lesson_scenario_proposals
     WHERE workspace_id = $1 AND idempotency_key = $2`,
    [context.workspaceId, idempotencyKey]
  );
  const row = result.rows[0];
  return row ? mapProposal(row) : null;
}

function assertReplayMatches(
  existing: LessonScenarioProposal,
  input: QueueLessonScenarioProposalInput
): void {
  const same =
    existing.lessonId === input.lessonId &&
    existing.requestedLessonVersion === input.requestedLessonVersion &&
    existing.candidateCountRequested === input.candidateCountRequested &&
    JSON.stringify(existing.contextGuard) === JSON.stringify(input.contextGuard) &&
    (existing.teacherInstruction ?? null) === (input.teacherInstruction ?? null);
  if (!same) {
    throw new ApplicationError(
      'CONFLICT',
      'The scenario request key was already used for a different request.',
      { idempotencyKey: input.idempotencyKey, existingProposalId: existing.id }
    );
  }
}

export class PostgresLessonScenarioProposalRepository
  implements LessonScenarioProposalRepository, LessonScenarioProposalProcessingRepository
{
  constructor(private readonly pool: Pool) {}

  async queue(
    context: RequestContext,
    input: QueueLessonScenarioProposalInput
  ): Promise<LessonScenarioProposal> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`,
        [context.workspaceId, input.idempotencyKey]
      );

      const existing = await existingByIdempotency(client, context, input.idempotencyKey);
      if (existing) {
        assertReplayMatches(existing, input);
        await client.query('COMMIT');
        return existing;
      }

      const payload = {
        scenarioProposalId: input.proposalId,
        lessonId: input.lessonId,
        requestedLessonVersion: input.requestedLessonVersion,
        candidateCountRequested: input.candidateCountRequested
      };
      const at = new Date(input.requestedAt);

      await client.query(
        `INSERT INTO async_jobs(
           id, workspace_id, job_type, schema_version, status,
           idempotency_key, payload_json, requested_by,
           available_at, created_at, updated_at
         ) VALUES (
           $1, $2, 'LESSON_SCENARIO_PROPOSAL', '1', 'QUEUED',
           $3, $4::jsonb, $5, $6, $6, $6
         )`,
        [
          input.jobId,
          context.workspaceId,
          input.idempotencyKey,
          JSON.stringify(payload),
          context.actorUserId,
          at
        ]
      );

      await client.query(
        `INSERT INTO lesson_scenario_proposals(
           id, workspace_id, lesson_id, status, requested_lesson_version,
           context_guard_json, candidate_count_requested, teacher_instruction,
           candidates_json, async_job_id, idempotency_key, requested_by,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'QUEUED', $4,
           $5::jsonb, $6, $7,
           '[]'::jsonb, $8, $9, $10,
           $11, $11
         )`,
        [
          input.proposalId,
          context.workspaceId,
          input.lessonId,
          input.requestedLessonVersion,
          JSON.stringify(input.contextGuard),
          input.candidateCountRequested,
          input.teacherInstruction ?? null,
          input.jobId,
          input.idempotencyKey,
          context.actorUserId,
          at
        ]
      );

      const created = await existingByIdempotency(client, context, input.idempotencyKey);
      if (!created) throw new Error('Scenario proposal was not restored after insert.');
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listByLesson(context: RequestContext, lessonId: string): Promise<LessonScenarioProposal[]> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM lesson_scenario_proposals
       WHERE workspace_id = $1 AND lesson_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [context.workspaceId, lessonId]
    );
    return result.rows.map(mapProposal);
  }

  async getById(context: RequestContext, proposalId: string): Promise<LessonScenarioProposal | null> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM lesson_scenario_proposals
       WHERE workspace_id = $1 AND id = $2`,
      [context.workspaceId, proposalId]
    );
    const row = result.rows[0];
    return row ? mapProposal(row) : null;
  }

  async dismiss(
    context: RequestContext,
    input: { proposalId: string; dismissedAt: string }
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'DISMISSED', dismissed_by = $3, dismissed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status = 'READY'
       RETURNING ${SELECT_COLUMNS}`,
      [context.workspaceId, input.proposalId, context.actorUserId, new Date(input.dismissedAt)]
    );
    const row = result.rows[0];
    if (row) return mapProposal(row);
    const current = await this.getById(context, input.proposalId);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', `Scenario proposal ${input.proposalId} was not found.`);
    }
    if (current.status === 'DISMISSED') return current;
    throw new ApplicationError(
      'CONFLICT',
      `Scenario proposal ${input.proposalId} cannot transition from ${current.status} to DISMISSED.`
    );
  }

  private async requireTransition(
    context: RequestContext,
    proposalId: string,
    result: { rows: ScenarioProposalRow[] },
    target: ScenarioProposalStatus
  ): Promise<LessonScenarioProposal> {
    const row = result.rows[0];
    if (row) return mapProposal(row);
    const current = await this.getById(context, proposalId);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', `Scenario proposal ${proposalId} was not found.`);
    }
    throw new ApplicationError(
      'CONFLICT',
      `Scenario proposal ${proposalId} cannot transition from ${current.status} to ${target}.`,
      { currentStatus: current.status, targetStatus: target }
    );
  }

  async markRunning(
    context: RequestContext,
    input: { proposalId: string; now: string }
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'RUNNING', updated_at = $3, error_json = NULL, completed_at = NULL
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [context.workspaceId, input.proposalId, new Date(input.now)]
    );
    return this.requireTransition(context, input.proposalId, result, 'RUNNING');
  }

  async markReady(
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
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'READY', candidates_json = $3::jsonb,
           provider = $4, model = $5, prompt_version = $6,
           routing_policy_version = $7, error_json = NULL,
           completed_at = $8, updated_at = $8
       WHERE workspace_id = $1 AND id = $2 AND status = 'RUNNING'
       RETURNING ${SELECT_COLUMNS}`,
      [
        context.workspaceId,
        input.proposalId,
        JSON.stringify(input.candidates),
        input.provider,
        input.model,
        input.promptVersion,
        input.routingPolicyVersion,
        new Date(input.now)
      ]
    );
    return this.requireTransition(context, input.proposalId, result, 'READY');
  }

  async markQueuedForRetry(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'QUEUED', error_json = $3::jsonb,
           completed_at = NULL, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [context.workspaceId, input.proposalId, JSON.stringify(input.error), new Date(input.now)]
    );
    return this.requireTransition(context, input.proposalId, result, 'QUEUED');
  }

  async markStale(
    context: RequestContext,
    input: { proposalId: string; now: string; reason: string }
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'STALE', error_json = $3::jsonb,
           completed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [
        context.workspaceId,
        input.proposalId,
        JSON.stringify({ code: 'SCENARIO_CONTEXT_STALE', message: input.reason }),
        new Date(input.now)
      ]
    );
    return this.requireTransition(context, input.proposalId, result, 'STALE');
  }

  async markFailed(
    context: RequestContext,
    input: {
      proposalId: string;
      now: string;
      error: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonScenarioProposal> {
    const result = await this.pool.query<ScenarioProposalRow>(
      `UPDATE lesson_scenario_proposals
       SET status = 'FAILED', error_json = $3::jsonb,
           completed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [context.workspaceId, input.proposalId, JSON.stringify(input.error), new Date(input.now)]
    );
    return this.requireTransition(context, input.proposalId, result, 'FAILED');
  }
}
