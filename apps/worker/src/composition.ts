import {
  ConfiguredAIRouter,
  OpenAICompatibleChatProvider,
  RoutedLessonDecisionProposalGenerator,
  RoutedProviderRegistry
} from '@tehkarta/ai';
import {
  ProcessLessonDecisionProposal,
  RunNextLessonDecisionProposalJob
} from '@tehkarta/application';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  PostgresAsyncJobProcessingRepository,
  PostgresCourseRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonRepository
} from '@tehkarta/database';
import type { Clock } from '@tehkarta/ports';
import type { WorkerConfig } from './config.js';
import { jsonConsoleLogger, WorkerRuntime } from './runtime.js';

export interface WorkerApplication {
  runtime: WorkerRuntime;
  readinessCheck(): Promise<boolean>;
  close(): Promise<void>;
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

  const provider = new OpenAICompatibleChatProvider({
    name: config.ai.providerName,
    baseUrl: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    timeoutMs: config.ai.timeoutMs,
    maxTokens: config.ai.maxTokens
  });

  // Block P2.5 deliberately uses one explicitly configured model for the two
  // proposal tasks. P2.6 will add provider-specific retry semantics and richer
  // routing without changing the worker/application boundary.
  const router = new ConfiguredAIRouter([
    {
      task: 'VARIANTS',
      provider: config.ai.providerName,
      model: config.ai.model,
      reasoningEffort: 'medium'
    },
    {
      task: 'REFORMULATE',
      provider: config.ai.providerName,
      model: config.ai.model,
      reasoningEffort: 'low'
    }
  ]);
  const providers = new RoutedProviderRegistry([
    {
      provider: config.ai.providerName,
      model: config.ai.model,
      client: provider
    }
  ]);
  const generator = new RoutedLessonDecisionProposalGenerator(
    router,
    providers,
    config.ai.routingPolicyVersion
  );

  const clock: Clock = { now: () => new Date() };
  const lessons = new PostgresLessonRepository(pool);
  const courses = new PostgresCourseRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const jobs = new PostgresAsyncJobProcessingRepository(pool);
  const processor = new ProcessLessonDecisionProposal({
    lessons,
    courses,
    proposals,
    generator,
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
