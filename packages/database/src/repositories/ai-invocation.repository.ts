import {
  ApplicationError,
  type AiInvocationTraceInput,
  type AiInvocationTraceRepository
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

/**
 * Durable AI execution metadata. Prompt and response bodies are intentionally
 * excluded: this repository stores only operational trace/provenance fields.
 */
export class PostgresAiInvocationRepository implements AiInvocationTraceRepository {
  constructor(private readonly pool: Pool) {}

  async record(context: RequestContext, input: AiInvocationTraceInput): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO ai_invocations(
         id, workspace_id, lesson_id, proposal_id, job_id,
         task_type, provider, model, prompt_version, routing_policy_version,
         input_hash, status, started_at, completed_at, latency_ms,
         input_tokens, output_tokens, cost_microunits, error_class, metadata
       )
       SELECT
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20::jsonb
       WHERE EXISTS (
         SELECT 1 FROM lessons l WHERE l.id = $3 AND l.workspace_id = $2
       )
         AND EXISTS (
           SELECT 1 FROM lesson_ai_proposals p WHERE p.id = $4 AND p.workspace_id = $2
         )
         AND EXISTS (
           SELECT 1 FROM async_jobs j WHERE j.id = $5 AND j.workspace_id = $2
         )
       ON CONFLICT (id) DO UPDATE SET
         lesson_id = EXCLUDED.lesson_id,
         proposal_id = EXCLUDED.proposal_id,
         job_id = EXCLUDED.job_id,
         task_type = EXCLUDED.task_type,
         provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         prompt_version = EXCLUDED.prompt_version,
         routing_policy_version = EXCLUDED.routing_policy_version,
         input_hash = EXCLUDED.input_hash,
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         latency_ms = EXCLUDED.latency_ms,
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         cost_microunits = EXCLUDED.cost_microunits,
         error_class = EXCLUDED.error_class,
         metadata = EXCLUDED.metadata
       WHERE ai_invocations.workspace_id = EXCLUDED.workspace_id`,
      [
        input.id,
        context.workspaceId,
        input.lessonId,
        input.proposalId,
        input.jobId,
        input.taskType,
        input.provider,
        input.model,
        input.promptVersion,
        input.routingPolicyVersion,
        input.inputHash,
        input.status,
        new Date(input.startedAt),
        new Date(input.completedAt),
        input.latencyMs ?? null,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.costMicrounits ?? null,
        input.errorClass ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    if (!result.rowCount) {
      throw new ApplicationError(
        'CONFLICT',
        `AI invocation ${input.id} could not be persisted in workspace ${context.workspaceId}.`
      );
    }
  }
}
