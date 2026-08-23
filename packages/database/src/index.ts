import { Pool, type PoolConfig } from 'pg';

export interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  idleTimeoutMs?: number;
  applicationName?: string;
  ssl?: PoolConfig['ssl'];
}

export function createPostgresPool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 10,
    statement_timeout: config.statementTimeoutMs ?? 15_000,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    application_name: config.applicationName ?? 'tehkarta-api',
    ssl: config.ssl
  });
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  return {
    connectionString,
    maxConnections: env.DB_POOL_MAX ? Number(env.DB_POOL_MAX) : undefined,
    statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS ? Number(env.DB_STATEMENT_TIMEOUT_MS) : undefined,
    idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS ? Number(env.DB_IDLE_TIMEOUT_MS) : undefined,
    applicationName: env.DB_APPLICATION_NAME ?? 'tehkarta-api',
    ssl: env.DB_SSL === 'require' ? { rejectUnauthorized: true } : undefined
  };
}

export * from './migrate.js';
export * from './repositories/course.repository.js';
export * from './repositories/lesson.repository.js';
