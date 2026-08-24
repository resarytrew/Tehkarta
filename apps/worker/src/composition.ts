import {
  ConfiguredAIRouter,
  createOpenRouterProvider,
  createYandexAIStudioProvider,
  RoutedLessonDecisionProposalGenerator,
  RoutedProviderRegistry,
  type AIProvider,
  type ModelRoute
} from '@tehkarta/ai';
import {
  ProcessLessonDecisionProposal,
  RunNextLessonDecisionProposalJob
} from '@tehkarta/application';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  PostgresAiInvocationRepository,
  PostgresAsyncJobProcessingRepository,
  PostgresCourseRepository,
  PostgresCoursePlanningRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonRepository
} from '@tehkarta/database';
import type { Clock } from '@tehkarta/ports';
import type { SupportedAIProvider, WorkerConfig } from './config.js';
import { jsonConsoleLogger, WorkerRuntime } from './runtime.js';

export interface WorkerApplication {
  runtime: WorkerRuntime;
  readinessCheck(): Promise<boolean>;
  close(): Promise<void>;
}

function providerClient(
  config: WorkerConfig,
  provider: SupportedAIProvider,
  model: string
): AIProvider {
  if (provider === 'yandex') {
    if (!config.ai.yandex) throw new Error('Yandex AI route is configured without Yandex credentials.');
    return createYandexAIStudioProvider({
      apiKey: config.ai.yandex.apiKey,
      baseUrl: config.ai.yandex.baseUrl,
      model,
      timeoutMs: config.ai.timeoutMs,
      maxTokens: config.ai.maxTokens
    });
  }

  if (!config.ai.openrouter) {
    throw new Error('OpenRouter route is configured without OpenRouter credentials.');
  }
  return createOpenRouterProvider({
    apiKey: config.ai.openrouter.apiKey,
    baseUrl: config.ai.openrouter.baseUrl,
    model,
    timeoutMs: config.ai.timeoutMs,
    maxTokens: config.ai.maxTokens,
    ...(config.ai.openrouter.httpReferer
      ? { httpReferer: config.ai.openrouter.httpReferer }
      : {}),
    ...(config.ai.openrouter.appTitle ? { appTitle: config.ai.openrouter.appTitle } : {})
  });
}

function providerEntries(config: WorkerConfig): Array<{
  provider: string;
  model: string;
  client: AIProvider;
}> {
  const routeConfigs = [config.ai.routes.variants, config.ai.routes.reformulate];
  const unique = new Map<string, { provider: SupportedAIProvider; model: string }>();
  for (const route of routeConfigs) unique.set(`${route.provider}::${route.model}`, route);

  return Array.from(unique.values()).map((route) => ({
    provider: route.provider,
    model: route.model,
    client: providerClient(config, route.provider, route.model)
  }));
}

export function createWorkerApplication(
  config: WorkerConfig,
  env: NodeJS.ProcessEnv = process.env
): WorkerApplication {
  const databaseConfig = databaseConfigFromEnv(env);
  const pool = createPostgresPool({
    ...databaseConfig,
    applicationName: env.DB_APPLICATION_NAME?.trim() || 'tehkarta-worker'
  });

  const routes: ModelRoute[] = [
    {
      task: 'VARIANTS',
      provider: config.ai.routes.variants.provider,
      model: config.ai.routes.variants.model,
      reasoningEffort: 'low'
    },
    {
      task: 'REFORMULATE',
      provider: config.ai.routes.reformulate.provider,
      model: config.ai.routes.reformulate.model,
      reasoningEffort: 'low'
    }
  ];
  const router = new ConfiguredAIRouter(routes);
  const providers = new RoutedProviderRegistry(providerEntries(config));
  const generator = new RoutedLessonDecisionProposalGenerator(
    router,
    providers,
    config.ai.routingPolicyVersion
  );

  const clock: Clock = { now: () => new Date() };
  const lessons = new PostgresLessonRepository(pool);
  const courses = new PostgresCourseRepository(pool);
  const coursePlanning = new PostgresCoursePlanningRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const jobs = new PostgresAsyncJobProcessingRepository(pool);
  const invocations = new PostgresAiInvocationRepository(pool);
  const processor = new ProcessLessonDecisionProposal({
    lessons,
    courses,
    coursePlanning,
    proposals,
    generator,
    invocations,
    clock
  });
  const runner = new RunNextLessonDecisionProposalJob({
    jobs,
    proposals,
    processor,
    clock
  });

  return {
    runtime: new WorkerRuntime(runner, jsonConsoleLogger, {
      workerId: config.workerId,
      pollIntervalMs: config.pollIntervalMs
    }),
    async readinessCheck() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await pool.end();
    }
  };
}
