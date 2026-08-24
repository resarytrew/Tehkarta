import { hostname } from 'node:os';
import { OPENROUTER_BASE_URL, YANDEX_AI_OPENAI_BASE_URL } from '@tehkarta/ai';

export type WorkerMode = 'poll' | 'once';
export type SupportedAIProvider = 'yandex' | 'openrouter';

export interface WorkerAiRouteConfig {
  provider: SupportedAIProvider;
  model: string;
}

export interface WorkerConfig {
  workerId: string;
  mode: WorkerMode;
  pollIntervalMs: number;
  healthPort: number;
  ai: {
    routingPolicyVersion: string;
    timeoutMs: number;
    maxTokens: number;
    routes: {
      variants: WorkerAiRouteConfig;
      reformulate: WorkerAiRouteConfig;
      scenario: WorkerAiRouteConfig;
    };
    yandex?: {
      apiKey: string;
      baseUrl: string;
    };
    openrouter?: {
      apiKey: string;
      baseUrl: string;
      httpReferer?: string;
      appTitle?: string;
    };
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

function provider(value: string | undefined, name: string): SupportedAIProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'yandex' || normalized === 'openrouter') return normalized;
  throw new Error(`${name} must be either yandex or openrouter.`);
}

function route(
  env: NodeJS.ProcessEnv,
  prefix: 'VARIANTS' | 'REFORMULATE' | 'SCENARIO'
): WorkerAiRouteConfig {
  return {
    provider: provider(env[`AI_${prefix}_PROVIDER`], `AI_${prefix}_PROVIDER`),
    model: required(env, `AI_${prefix}_MODEL`)
  };
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function workerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const variants = route(env, 'VARIANTS');
  const reformulate = route(env, 'REFORMULATE');
  const scenario = route(env, 'SCENARIO');
  const providers = new Set<SupportedAIProvider>([
    variants.provider,
    reformulate.provider,
    scenario.provider
  ]);

  const ai: WorkerConfig['ai'] = {
    routingPolicyVersion: env.AI_ROUTING_POLICY_VERSION?.trim() || 'routing-v2',
    timeoutMs: boundedInteger(env.AI_TIMEOUT_MS, 'AI_TIMEOUT_MS', 90_000, 1_000, 300_000),
    maxTokens: boundedInteger(env.AI_MAX_TOKENS, 'AI_MAX_TOKENS', 2_000, 128, 32_000),
    routes: { variants, reformulate, scenario }
  };

  if (providers.has('yandex')) {
    ai.yandex = {
      apiKey: required(env, 'YANDEX_AI_API_KEY'),
      baseUrl: optional(env.YANDEX_AI_BASE_URL) ?? YANDEX_AI_OPENAI_BASE_URL
    };
  }

  if (providers.has('openrouter')) {
    const httpReferer = optional(env.OPENROUTER_HTTP_REFERER);
    const appTitle = optional(env.OPENROUTER_APP_TITLE);
    ai.openrouter = {
      apiKey: required(env, 'OPENROUTER_API_KEY'),
      baseUrl: optional(env.OPENROUTER_BASE_URL) ?? OPENROUTER_BASE_URL,
      ...(httpReferer ? { httpReferer } : {}),
      ...(appTitle ? { appTitle } : {})
    };
  }

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
    ai
  };
}
