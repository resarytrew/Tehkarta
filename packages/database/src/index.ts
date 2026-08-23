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
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: config.maxConnections ?? 10,
    statement_timeout: config.statementTimeoutMs ?? 15_000,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    application_name: config.applicationName ?? 'tehkarta-api'
  };

  if (config.ssl !== undefined) {
    poolConfig.ssl = config.ssl;
  }

  return new Pool(poolConfig);
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const config: DatabaseConfig = {
    connectionString,
    applicationName: env.DB_APPLICATION_NAME ?? 'tehkarta-api'
  };

  if (env.DB_POOL_MAX) config.maxConnections = Number(env.DB_POOL_MAX);
  if (env.DB_STATEMENT_TIMEOUT_MS) config.statementTimeoutMs = Number(env.DB_STATEMENT_TIMEOUT_MS);
  if (env.DB_IDLE_TIMEOUT_MS) config.idleTimeoutMs = Number(env.DB_IDLE_TIMEOUT_MS);
  if (env.DB_SSL === 'require') config.ssl = { rejectUnauthorized: true };

  return config;
}

export * from './migrate.js';
export * from './repositories/course.repository.js';
export * from './repositories/identity.repository.js';
export * from './repositories/lesson.repository.js';
