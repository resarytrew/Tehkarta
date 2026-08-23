import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const MIGRATION_LOCK_ID = 7_431_982_117;

interface AppliedMigration {
  name: string;
  checksum: string;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stripTransactionWrapper(sql: string): string {
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '')
    .trim();
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied(client: PoolClient): Promise<Map<string, string>> {
  const result = await client.query<AppliedMigration>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name'
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

export async function migrateDatabase(input?: {
  databaseUrl?: string;
  migrationsDir?: string;
}): Promise<void> {
  const databaseUrl = input?.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  const migrationsDir = resolve(input?.migrationsDir ?? process.env.MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR);
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await ensureMigrationsTable(client);
    const applied = await loadApplied(client);

    for (const name of files) {
      const sql = await readFile(resolve(migrationsDir, name), 'utf8');
      const checksum = sha256(sql);
      const existingChecksum = applied.get(name);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Migration ${name} was modified after application. Expected checksum ${existingChecksum}, got ${checksum}. Create a new migration instead.`
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(stripTransactionWrapper(sql));
        await client.query(
          'INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)',
          [name, checksum]
        );
        await client.query('COMMIT');
        console.info(`[database] applied migration ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
