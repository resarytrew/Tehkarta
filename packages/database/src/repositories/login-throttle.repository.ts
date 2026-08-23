import type {
  LoginThrottlePolicy,
  LoginThrottleRepository,
  LoginThrottleScope,
  LoginThrottleState
} from '@tehkarta/identity';
import type { Pool, PoolClient } from 'pg';

interface ThrottleRow {
  scope: LoginThrottleScope;
  key_hash: string;
  window_started_at: Date;
  failure_count: number;
  blocked_until: Date | null;
}

function mapRow(row: ThrottleRow): LoginThrottleState {
  return {
    scope: row.scope,
    keyHash: row.key_hash,
    windowStartedAt: row.window_started_at.toISOString(),
    failureCount: row.failure_count,
    blockedUntil: row.blocked_until?.toISOString() ?? null
  };
}

async function selectForUpdate(
  client: PoolClient,
  scope: LoginThrottleScope,
  keyHash: string
): Promise<ThrottleRow | null> {
  const result = await client.query<ThrottleRow>(
    `SELECT scope, key_hash, window_started_at, failure_count, blocked_until
     FROM auth_login_throttles
     WHERE scope = $1 AND key_hash = $2
     FOR UPDATE`,
    [scope, keyHash]
  );
  return result.rows[0] ?? null;
}

function nextState(
  row: ThrottleRow | null,
  scope: LoginThrottleScope,
  keyHash: string,
  at: Date,
  policy: LoginThrottlePolicy
): ThrottleRow {
  if (!row) {
    const shouldBlock = policy.maxFailures <= 1;
    return {
      scope,
      key_hash: keyHash,
      window_started_at: at,
      failure_count: 1,
      blocked_until: shouldBlock
        ? new Date(at.getTime() + policy.blockSeconds * 1000)
        : null
    };
  }

  const activeBlock = row.blocked_until && row.blocked_until.getTime() > at.getTime();
  if (activeBlock) return row;

  const windowExpired =
    at.getTime() - row.window_started_at.getTime() >= policy.windowSeconds * 1000;
  const failureCount = windowExpired ? 1 : row.failure_count + 1;

  return {
    scope,
    key_hash: keyHash,
    window_started_at: windowExpired ? at : row.window_started_at,
    failure_count: failureCount,
    blocked_until:
      failureCount >= policy.maxFailures
        ? new Date(at.getTime() + policy.blockSeconds * 1000)
        : null
  };
}

export class PostgresLoginThrottleRepository implements LoginThrottleRepository {
  constructor(private readonly pool: Pool) {}

  async get(scope: LoginThrottleScope, keyHash: string): Promise<LoginThrottleState | null> {
    const result = await this.pool.query<ThrottleRow>(
      `SELECT scope, key_hash, window_started_at, failure_count, blocked_until
       FROM auth_login_throttles
       WHERE scope = $1 AND key_hash = $2`,
      [scope, keyHash]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async recordFailure(input: {
    scope: LoginThrottleScope;
    keyHash: string;
    at: string;
    policy: LoginThrottlePolicy;
  }): Promise<LoginThrottleState> {
    const at = new Date(input.at);
    if (Number.isNaN(at.getTime())) throw new Error('Invalid throttle timestamp.');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await selectForUpdate(client, input.scope, input.keyHash);
      const next = nextState(existing, input.scope, input.keyHash, at, input.policy);

      if (existing) {
        await client.query(
          `UPDATE auth_login_throttles
           SET window_started_at = $3,
               failure_count = $4,
               blocked_until = $5,
               updated_at = $6
           WHERE scope = $1 AND key_hash = $2`,
          [
            input.scope,
            input.keyHash,
            next.window_started_at,
            next.failure_count,
            next.blocked_until,
            at
          ]
        );
      } else {
        // Concurrent first attempts can race before either transaction has a row
        // to lock. Let the unique key arbitrate, then retry the state transition
        // under a row lock inside the same transaction.
        try {
          await client.query(
            `INSERT INTO auth_login_throttles(
               scope, key_hash, window_started_at, failure_count, blocked_until, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              input.scope,
              input.keyHash,
              next.window_started_at,
              next.failure_count,
              next.blocked_until,
              at
            ]
          );
        } catch (error: unknown) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === '23505')) {
            throw error;
          }
          // PostgreSQL marks a transaction failed after a unique violation, so
          // restart before taking the now-existing row lock.
          await client.query('ROLLBACK');
          await client.query('BEGIN');
          const raced = await selectForUpdate(client, input.scope, input.keyHash);
          const racedNext = nextState(raced, input.scope, input.keyHash, at, input.policy);
          await client.query(
            `UPDATE auth_login_throttles
             SET window_started_at = $3,
                 failure_count = $4,
                 blocked_until = $5,
                 updated_at = $6
             WHERE scope = $1 AND key_hash = $2`,
            [
              input.scope,
              input.keyHash,
              racedNext.window_started_at,
              racedNext.failure_count,
              racedNext.blocked_until,
              at
            ]
          );
          await client.query('COMMIT');
          return mapRow(racedNext);
        }
      }

      await client.query('COMMIT');
      return mapRow(next);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async clear(scope: LoginThrottleScope, keyHash: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM auth_login_throttles WHERE scope = $1 AND key_hash = $2',
      [scope, keyHash]
    );
  }
}
