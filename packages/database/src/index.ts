import { readFileSync } from 'node:fs';
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

function optionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function databaseSslFromEnv(env: NodeJS.ProcessEnv): PoolConfig['ssl'] | undefined {
  const mode = (env.DB_SSL ?? 'disable').trim().toLowerCase();
  if (mode === 'disable' || mode === 'off' || mode === 'false') return undefined;

  if (mode === 'require') {
    // Encryption without CA verification. Prefer verify-full for production when
    // TLS is enabled; private Yandex VPC connectivity may also run without TLS.
    return { rejectUnauthorized: false };
  }

  if (mode === 'verify-full') {
    const caPath = env.DB_SSL_CA_PATH;
    if (!caPath) {
      throw new Error('DB_SSL_CA_PATH is required when DB_SSL=verify-full.');
    }
    return {
      rejectUnauthorized: true,
      ca: readFileSync(caPath, 'utf8')
    };
  }

  throw new Error('DB_SSL must be one of: disable, require, verify-full.');
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const config: DatabaseConfig = {
    connectionString: databaseConnectionStringFromEnv(env),
    applicationName: env.DB_APPLICATION_NAME ?? 'tehkarta-api'
  };

  const maxConnections = optionalPositiveInteger(env.DB_POOL_MAX, 'DB_POOL_MAX');
  const statementTimeoutMs = optionalPositiveInteger(
    env.DB_STATEMENT_TIMEOUT_MS,
    'DB_STATEMENT_TIMEOUT_MS'
  );
  const idleTimeoutMs = optionalPositiveInteger(env.DB_IDLE_TIMEOUT_MS, 'DB_IDLE_TIMEOUT_MS');
  const ssl = databaseSslFromEnv(env);

  if (maxConnections !== undefined) config.maxConnections = maxConnections;
  if (statementTimeoutMs !== undefined) config.statementTimeoutMs = statementTimeoutMs;
  if (idleTimeoutMs !== undefined) config.idleTimeoutMs = idleTimeoutMs;
  if (ssl !== undefined) config.ssl = ssl;

  return config;
}

export * from './migrate.js';
export * from './repositories/ai-proposal.repository.js';
export * from './repositories/async-job.repository.js';
export * from './repositories/course.repository.js';
export * from './repositories/identity.repository.js';
export * from './repositories/lesson-invalidation.repository.js';
export * from './repositories/lesson.repository.js';
export * from './repositories/login-throttle.repository.js';
