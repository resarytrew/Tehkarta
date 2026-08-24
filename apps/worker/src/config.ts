import { hostname } from 'node:os';

export type WorkerMode = 'poll' | 'once';

export interface WorkerConfig {
  workerId: string;
  mode: WorkerMode;
  pollIntervalMs: number;
  healthPort: number;
  ai: {
    providerName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    routingPolicyVersion: string;
    timeoutMs: number;
    maxTokens: number;
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function workerMode(value: string | undefined): WorkerMode {
  const normalized = (value ?? 'poll').trim().toLowerCase();
  if (normalized === 'poll' || normalized === 'once') return normalized;
  throw new Error('WORKER_MODE must be either poll or once.');
}

export function workerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    workerId: env.WORKER_ID?.trim() || `${hostname()}:${process.pid}`,
    mode: workerMode(env.WORKER_MODE),
    pollIntervalMs: boundedInteger(
      env.WORKER_POLL_INTERVAL_MS,
      'WORKER_POLL_INTERVAL_MS',
      1_500,
      100,
      60_000
    ),
    healthPort: boundedInteger(
      env.WORKER_HEALTH_PORT ?? env.PORT,
      'WORKER_HEALTH_PORT',
      8_080,
      1,
      65_535
    ),
    ai: {
      providerName: env.AI_PROVIDER_NAME?.trim() || 'openai-compatible',
      baseUrl: required(env, 'AI_BASE_URL'),
      apiKey: required(env, 'AI_API_KEY'),
      model: required(env, 'AI_MODEL'),
      routingPolicyVersion: env.AI_ROUTING_POLICY_VERSION?.trim() || 'routing-v1',
      timeoutMs: boundedInteger(env.AI_TIMEOUT_MS, 'AI_TIMEOUT_MS', 90_000, 1_000, 300_000),
      maxTokens: boundedInteger(env.AI_MAX_TOKENS, 'AI_MAX_TOKENS', 2_000, 128, 32_000)
    }
  };
}
