import {
  ApplicationError,
  type AiProposalAction,
  type AiProposalCandidate,
  type AiProposalStatus,
  type LessonAiProposal,
  type LessonAiProposalProcessingRepository,
  type LessonAiProposalRepository,
  type QueueLessonAiProposalInput
} from '@tehkarta/application';
import type { CoreLessonDecisionKey } from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

interface ProposalRow {
  id: string;
  workspace_id: string;
  lesson_id: string;
  semantic_key: CoreLessonDecisionKey;
  action: AiProposalAction;
  status: AiProposalStatus;
  base_decision_id: string | null;
  base_revision: number | null;
  requested_lesson_version: number;
  candidate_count_requested: number;
  teacher_instruction: string | null;
  candidates_json: unknown;
  async_job_id: string;
  idempotency_key: string;
  requested_by: string;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  routing_policy_version: string | null;
  error_json: unknown;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  applied_candidate_id: string | null;
  applied_decision_id: string | null;
  applied_decision_revision: number | null;
  applied_by: string | null;
  applied_at: Date | null;
  dismissed_by: string | null;
  dismissed_at: Date | null;
}

function candidates(value: unknown): AiProposalCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is AiProposalCandidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      typeof item.value === 'string' &&
      typeof item.rationale === 'string' &&
      (item.distinction === undefined || typeof item.distinction === 'string')
    );
  });
}

function errorPayload(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function mapProposal(row: ProposalRow): LessonAiProposal {
  const proposal: LessonAiProposal = {
    id: row.id,
    workspaceId: row.workspace_id,
    lessonId: row.lesson_id,
    semanticKey: row.semantic_key,
    action: row.action,
    status: row.status,
    requestedLessonVersion: row.requested_lesson_version,
    candidateCountRequested: row.candidate_count_requested,
    candidates: candidates(row.candidates_json),
    asyncJobId: row.async_job_id,
    idempotencyKey: row.idempotency_key,
    requestedBy: row.requested_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };

  if (row.base_decision_id) proposal.baseDecisionId = row.base_decision_id;
  if (row.base_revision !== null) proposal.baseRevision = row.base_revision;
  if (row.teacher_instruction) proposal.teacherInstruction = row.teacher_instruction;
  if (row.provider) proposal.provider = row.provider;
  if (row.model) proposal.model = row.model;
  if (row.prompt_version) proposal.promptVersion = row.prompt_version;
  if (row.routing_policy_version) proposal.routingPolicyVersion = row.routing_policy_version;
  const error = errorPayload(row.error_json);
  if (error) proposal.error = error;
  if (row.completed_at) proposal.completedAt = row.completed_at.toISOString();
  if (row.applied_candidate_id) proposal.appliedCandidateId = row.applied_candidate_id;
  if (row.applied_decision_id) proposal.appliedDecisionId = row.applied_decision_id;
  if (row.applied_decision_revision !== null) {
    proposal.appliedDecisionRevision = row.applied_decision_revision;
  }
  if (row.applied_by) proposal.appliedBy = row.applied_by;
  if (row.applied_at) proposal.appliedAt = row.applied_at.toISOString();
  if (row.dismissed_by) proposal.dismissedBy = row.dismissed_by;
  if (row.dismissed_at) proposal.dismissedAt = row.dismissed_at.toISOString();

  return proposal;
}

const SELECT_COLUMNS = `
  id, workspace_id, lesson_id, semantic_key, action, status,
  base_decision_id, base_revision, requested_lesson_version,
  candidate_count_requested, teacher_instruction, candidates_json,
  async_job_id, idempotency_key, requested_by, provider, model,
  prompt_version, routing_policy_version, error_json,
  created_at, updated_at, completed_at,
  applied_candidate_id, applied_decision_id, applied_decision_revision,
  applied_by, applied_at, dismissed_by, dismissed_at
`;

async function existingByIdempotency(
  client: PoolClient,
  context: RequestContext,
  idempotencyKey: string
): Promise<LessonAiProposal | null> {
  const result = await client.query<ProposalRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM lesson_ai_proposals
     WHERE workspace_id = $1 AND idempotency_key = $2`,
    [context.workspaceId, idempotencyKey]
  );
  const row = result.rows[0];
  return row ? mapProposal(row) : null;
}

function assertIdempotentReplayMatches(
  existing: LessonAiProposal,
  input: QueueLessonAiProposalInput
): void {
  const sameRequest =
    existing.lessonId === input.lessonId &&
    existing.semanticKey === input.semanticKey &&
    existing.action === input.action &&
    existing.requestedLessonVersion === input.requestedLessonVersion &&
    existing.candidateCountRequested === input.candidateCountRequested &&
    (existing.baseDecisionId ?? null) === (input.baseDecisionId ?? null) &&
    (existing.baseRevision ?? null) === (input.baseRevision ?? null) &&
    (existing.teacherInstruction ?? null) === (input.teacherInstruction ?? null);

  if (!sameRequest) {
    throw new ApplicationError(
      'CONFLICT',
      'The AI proposal request key was already used for a different request.',
      {
        idempotencyKey: input.idempotencyKey,
        existingProposalId: existing.id
      }
    );
  }
}

export class PostgresLessonAiProposalRepository
  implements LessonAiProposalRepository, LessonAiProposalProcessingRepository
{
  constructor(private readonly pool: Pool) {}

  async queue(
    context: RequestContext,
    input: QueueLessonAiProposalInput
  ): Promise<LessonAiProposal> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`,
        [context.workspaceId, input.idempotencyKey]
      );

      const existing = await existingByIdempotency(client, context, input.idempotencyKey);
      if (existing) {
        assertIdempotentReplayMatches(existing, input);
        await client.query('COMMIT');
        return existing;
      }

      const payload = {
        proposalId: input.proposalId,
        lessonId: input.lessonId,
        semanticKey: input.semanticKey,
        action: input.action,
        requestedLessonVersion: input.requestedLessonVersion,
        baseDecisionId: input.baseDecisionId ?? null,
        baseRevision: input.baseRevision ?? null,
        candidateCountRequested: input.candidateCountRequested
      };

      await client.query(
        `INSERT INTO async_jobs(
           id, workspace_id, job_type, schema_version, status,
           idempotency_key, payload_json, requested_by,
           available_at, created_at, updated_at
         ) VALUES (
           $1, $2, 'LESSON_DECISION_PROPOSAL', '1', 'QUEUED',
           $3, $4::jsonb, $5, $6, $6, $6
         )`,
        [
          input.jobId,
          context.workspaceId,
          input.idempotencyKey,
          JSON.stringify(payload),
          context.actorUserId,
          new Date(input.requestedAt)
        ]
      );

      await client.query(
        `INSERT INTO lesson_ai_proposals(
           id, workspace_id, lesson_id, semantic_key, action, status,
           base_decision_id, base_revision, base_value_json,
           requested_lesson_version, candidate_count_requested,
           teacher_instruction, candidates_json, async_job_id,
           idempotency_key, requested_by, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'QUEUED',
           $6, $7, $8::jsonb,
           $9, $10,
           $11, '[]'::jsonb, $12,
           $13, $14, $15, $15
         )`,
        [
          input.proposalId,
          context.workspaceId,
          input.lessonId,
          input.semanticKey,
          input.action,
          input.baseDecisionId ?? null,
          input.baseRevision ?? null,
          input.baseValue === undefined ? null : JSON.stringify(input.baseValue),
          input.requestedLessonVersion,
          input.candidateCountRequested,
          input.teacherInstruction ?? null,
          input.jobId,
          input.idempotencyKey,
          context.actorUserId,
          new Date(input.requestedAt)
        ]
      );

      const created = await existingByIdempotency(client, context, input.idempotencyKey);
      if (!created) throw new Error('AI proposal was not restored after insert.');

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listByLesson(
    context: RequestContext,
    lessonId: string,
    semanticKey?: CoreLessonDecisionKey
  ): Promise<LessonAiProposal[]> {
    const params: unknown[] = [context.workspaceId, lessonId];
    let semanticFilter = '';
    if (semanticKey) {
      params.push(semanticKey);
      semanticFilter = 'AND semantic_key = $3';
    }

    const result = await this.pool.query<ProposalRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM lesson_ai_proposals
       WHERE workspace_id = $1 AND lesson_id = $2
       ${semanticFilter}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );

    return result.rows.map(mapProposal);
  }

  async getById(context: RequestContext, proposalId: string): Promise<LessonAiProposal | null> {
    const result = await this.pool.query<ProposalRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM lesson_ai_proposals
       WHERE workspace_id = $1 AND id = $2`,
      [context.workspaceId, proposalId]
    );
    const row = result.rows[0];
    return row ? mapProposal(row) : null;
  }

  async dismiss(
    context: RequestContext,
    input: { proposalId: string; dismissedAt: string }
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
       SET status = 'DISMISSED', dismissed_by = $3, dismissed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status = 'READY'
       RETURNING ${SELECT_COLUMNS}`,
      [context.workspaceId, input.proposalId, context.actorUserId, new Date(input.dismissedAt)]
    );
    const row = result.rows[0];
    if (row) return mapProposal(row);

    const current = await this.getById(context, input.proposalId);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', `AI proposal ${input.proposalId} was not found.`);
    }
    if (current.status === 'DISMISSED') return current;

    throw new ApplicationError(
      'CONFLICT',
      `AI proposal ${input.proposalId} cannot transition from ${current.status} to DISMISSED.`,
      { currentStatus: current.status, targetStatus: 'DISMISSED' }
    );
  }

  private async requireTransition(
    context: RequestContext,
    proposalId: string,
    result: { rows: ProposalRow[] },
    targetStatus: AiProposalStatus
  ): Promise<LessonAiProposal> {
    const row = result.rows[0];
    if (row) return mapProposal(row);

    const current = await this.getById(context, proposalId);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', `AI proposal ${proposalId} was not found.`);
    }
    throw new ApplicationError(
      'CONFLICT',
      `AI proposal ${proposalId} cannot transition from ${current.status} to ${targetStatus}.`,
      { currentStatus: current.status, targetStatus }
    );
  }

  async markRunning(
    context: RequestContext,
    input: { proposalId: string; now: string }
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
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
      candidates: AiProposalCandidate[];
      provider: string;
      model: string;
      promptVersion: string;
      routingPolicyVersion: string;
      now: string;
    }
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
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
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
       SET status = 'QUEUED', error_json = $3::jsonb,
           completed_at = NULL, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [
        context.workspaceId,
        input.proposalId,
        JSON.stringify(input.error),
        new Date(input.now)
      ]
    );
    return this.requireTransition(context, input.proposalId, result, 'QUEUED');
  }

  async markStale(
    context: RequestContext,
    input: { proposalId: string; now: string; reason: string }
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
       SET status = 'STALE', error_json = $3::jsonb,
           completed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [
        context.workspaceId,
        input.proposalId,
        JSON.stringify({ code: 'PROPOSAL_STALE', message: input.reason }),
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
  ): Promise<LessonAiProposal> {
    const result = await this.pool.query<ProposalRow>(
      `UPDATE lesson_ai_proposals
       SET status = 'FAILED', error_json = $3::jsonb,
           completed_at = $4, updated_at = $4
       WHERE workspace_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING')
       RETURNING ${SELECT_COLUMNS}`,
      [
        context.workspaceId,
        input.proposalId,
        JSON.stringify(input.error),
        new Date(input.now)
      ]
    );
    return this.requireTransition(context, input.proposalId, result, 'FAILED');
  }
}
