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

function databaseConnectionStringFromEnv(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const host = env.DB_HOST;
  const database = env.DB_NAME;
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;

  const missing = [
    ['DB_HOST', host],
    ['DB_NAME', database],
    ['DB_USER', user],
    ['DB_PASSWORD', password]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Database configuration is incomplete. Set DATABASE_URL or all split variables. Missing: ${missing.join(', ')}.`
    );
  }

  const port = env.DB_PORT ?? '5432';
  return `postgresql://${encodeURIComponent(user!)}:${encodeURIComponent(password!)}@${host}:${port}/${encodeURIComponent(database!)}`;
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const config: DatabaseConfig = {
    connectionString: databaseConnectionStringFromEnv(env),
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
