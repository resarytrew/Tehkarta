import {
  ConfiguredAIRouter,
  createOpenRouterProvider,
  createYandexAIStudioProvider,
  RoutedLessonDecisionProposalGenerator,
  RoutedLessonScenarioProposalGenerator,
  RoutedProviderRegistry,
  type AIProvider,
  type ModelRoute
} from '@tehkarta/ai';
import {
  BuildApprovedScenarioContext,
  ProcessLessonDecisionProposal,
  ProcessLessonScenarioProposal,
  RunNextLessonDecisionProposalJob,
  RunNextLessonScenarioProposalJob
} from '@tehkarta/application';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  PostgresAiInvocationRepository,
  PostgresAsyncJobProcessingRepository,
  PostgresCourseRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonContentContextRepository,
  PostgresLessonRepository,
  PostgresLessonScenarioProposalRepository,
  PostgresScenarioAiInvocationRepository
} from '@tehkarta/database';
import type { Clock } from '@tehkarta/ports';
import { RotatingCompositeProposalJobRunner } from './composite-runner.js';
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
  const routeConfigs = [
    config.ai.routes.variants,
    config.ai.routes.reformulate,
    config.ai.routes.scenario
  ];
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
      reasoningEffort: 'medium'
    },
    {
      task: 'REFORMULATE',
      provider: config.ai.routes.reformulate.provider,
      model: config.ai.routes.reformulate.model,
      reasoningEffort: 'low'
    },
    {
      task: 'SCENARIO_DESIGN',
      provider: config.ai.routes.scenario.provider,
      model: config.ai.routes.scenario.model,
      reasoningEffort: 'medium'
    }
  ];
  const router = new ConfiguredAIRouter(routes);
  const providers = new RoutedProviderRegistry(providerEntries(config));
  const decisionGenerator = new RoutedLessonDecisionProposalGenerator(
    router,
    providers,
    config.ai.routingPolicyVersion
  );
  const scenarioGenerator = new RoutedLessonScenarioProposalGenerator(
    router,
    providers,
    config.ai.routingPolicyVersion
  );

  const clock: Clock = { now: () => new Date() };
  const lessons = new PostgresLessonRepository(pool);
  const courses = new PostgresCourseRepository(pool);
  const contentContext = new PostgresLessonContentContextRepository(pool);
  const jobs = new PostgresAsyncJobProcessingRepository(pool);

  const decisionProposals = new PostgresLessonAiProposalRepository(pool);
  const decisionProcessor = new ProcessLessonDecisionProposal({
    lessons,
    courses,
    proposals: decisionProposals,
    generator: decisionGenerator,
    invocations: new PostgresAiInvocationRepository(pool),
    clock
  });
  const decisionRunner = new RunNextLessonDecisionProposalJob({
    jobs,
    proposals: decisionProposals,
    processor: decisionProcessor,
    clock
  });

  const scenarioContext = new BuildApprovedScenarioContext({ lessons, courses, contentContext });
  const scenarioProposals = new PostgresLessonScenarioProposalRepository(pool);
  const scenarioProcessor = new ProcessLessonScenarioProposal({
    scenarioContext,
    proposals: scenarioProposals,
    generator: scenarioGenerator,
    invocations: new PostgresScenarioAiInvocationRepository(pool),
    clock
  });
  const scenarioRunner = new RunNextLessonScenarioProposalJob({
    jobs,
    proposals: scenarioProposals,
    processor: scenarioProcessor,
    clock
  });

  const runner = new RotatingCompositeProposalJobRunner([decisionRunner, scenarioRunner]);

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
