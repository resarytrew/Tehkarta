import {
  ApplicationError,
  type AsyncJobProcessingRepository,
  type ClaimedAsyncJob
} from '@tehkarta/application';
import type { Pool } from 'pg';

interface AsyncJobRow {
  id: string;
  workspace_id: string;
  job_type: string;
  schema_version: string;
  payload_json: unknown;
  requested_by: string | null;
  attempt_count: number;
  max_attempts: number;
}

function payloadObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('VALIDATION_FAILED', 'Async job payload must be a JSON object.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function mapClaimed(row: AsyncJobRow): ClaimedAsyncJob {
  if (!row.requested_by) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      `Async job ${row.id} has no requesting actor.`
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobType: row.job_type,
    schemaVersion: row.schema_version,
    payload: payloadObject(row.payload_json),
    requestedBy: row.requested_by,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts
  };
}

/**
 * PostgreSQL-backed worker queue. FOR UPDATE SKIP LOCKED lets multiple worker
 * instances claim jobs concurrently without processing the same row. A RUNNING
 * job whose five-minute lease expired can be reclaimed after a worker crash.
 */
export class PostgresAsyncJobProcessingRepository implements AsyncJobProcessingRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(input: {
    workerId: string;
    jobType: string;
    now: string;
  }): Promise<ClaimedAsyncJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<AsyncJobRow>(
        `SELECT id, workspace_id, job_type, schema_version, payload_json,
                requested_by, attempt_count, max_attempts
         FROM async_jobs
         WHERE job_type = $1
           AND attempt_count < max_attempts
           AND available_at <= $2
           AND (
             status IN ('QUEUED', 'FAILED')
             OR (
               status = 'RUNNING'
               AND locked_at IS NOT NULL
               AND locked_at < $2::timestamptz - interval '5 minutes'
             )
           )
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [input.jobType, new Date(input.now)]
      );

      const candidate = selected.rows[0];
      if (!candidate) {
        await client.query('COMMIT');
        return null;
      }

      const claimed = await client.query<AsyncJobRow>(
        `UPDATE async_jobs
         SET status = 'RUNNING',
             attempt_count = attempt_count + 1,
             locked_at = $2,
             locked_by = $3,
             started_at = COALESCE(started_at, $2),
             updated_at = $2,
             error_json = NULL
         WHERE id = $1
         RETURNING id, workspace_id, job_type, schema_version, payload_json,
                   requested_by, attempt_count, max_attempts`,
        [candidate.id, new Date(input.now), input.workerId]
      );

      await client.query('COMMIT');
      const row = claimed.rows[0];
      return row ? mapClaimed(row) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async succeed(input: {
    jobId: string;
    workerId: string;
    now: string;
    result: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const result = await this.pool.query(
      `UPDATE async_jobs
       SET status = 'SUCCEEDED', result_json = $4::jsonb,
           error_json = NULL, finished_at = $3, updated_at = $3,
           locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND status = 'RUNNING' AND locked_by = $2`,
      [input.jobId, input.workerId, new Date(input.now), JSON.stringify(input.result)]
    );
    if (!result.rowCount) {
      throw new ApplicationError(
        'CONFLICT',
        `Async job ${input.jobId} is no longer owned by worker ${input.workerId}.`
      );
    }
  }

  async fail(input: {
    jobId: string;
    workerId: string;
    now: string;
    error: Readonly<Record<string, unknown>>;
    retryAt?: string;
  }): Promise<void> {
    const current = await this.pool.query<{ attempt_count: number; max_attempts: number }>(
      `SELECT attempt_count, max_attempts
       FROM async_jobs
       WHERE id = $1 AND status = 'RUNNING' AND locked_by = $2`,
      [input.jobId, input.workerId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new ApplicationError(
        'CONFLICT',
        `Async job ${input.jobId} is no longer owned by worker ${input.workerId}.`
      );
    }

    const terminal = row.attempt_count >= row.max_attempts;
    const now = new Date(input.now);
    const retryAt = input.retryAt ? new Date(input.retryAt) : now;

    await this.pool.query(
      `UPDATE async_jobs
       SET status = 'FAILED', error_json = $3::jsonb,
           available_at = $4,
           finished_at = CASE WHEN $5 THEN $6 ELSE NULL END,
           updated_at = $6, locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND status = 'RUNNING' AND locked_by = $2`,
      [
        input.jobId,
        input.workerId,
        JSON.stringify(input.error),
        retryAt,
        terminal,
        now
      ]
    );
  }
}
