import { createWorkerApplication } from './composition.js';
import { workerConfigFromEnv } from './config.js';
import { startWorkerHealthServer } from './health.js';
import { jsonConsoleLogger } from './runtime.js';

function fatalSummary(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message.slice(0, 500)
    };
  }
  return { errorName: 'UnknownError' };
}

async function main(): Promise<void> {
  const config = workerConfigFromEnv();
  const application = createWorkerApplication(config);

  if (config.mode === 'once') {
    try {
      if (!(await application.readinessCheck())) {
        throw new Error('Worker database readiness check failed.');
      }
      const result = await application.runtime.runOnce();
      jsonConsoleLogger.info({
        event: 'worker.once.completed',
        workerId: config.workerId,
        resultStatus: result.status
      });
    } finally {
      await application.close();
    }
    return;
  }

  const abortController = new AbortController();
  let shuttingDown = false;

  const requestShutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    jsonConsoleLogger.info({
      event: 'worker.shutdown.requested',
      workerId: config.workerId,
      signal
    });
    abortController.abort();
  };

  process.once('SIGTERM', requestShutdown);
  process.once('SIGINT', requestShutdown);

  const health = await startWorkerHealthServer({
    port: config.healthPort,
    workerId: config.workerId,
    isShuttingDown: () => shuttingDown,
    readinessCheck: application.readinessCheck
  });

  jsonConsoleLogger.info({
    event: 'worker.started',
    workerId: config.workerId,
    mode: config.mode,
    healthPort: health.port
  });

  try {
    await application.runtime.runUntilStopped(abortController.signal);
  } finally {
    shuttingDown = true;
    await health.close();
    await application.close();
    process.off('SIGTERM', requestShutdown);
    process.off('SIGINT', requestShutdown);
    jsonConsoleLogger.info({
      event: 'worker.stopped',
      workerId: config.workerId
    });
  }
}

main().catch((error) => {
  jsonConsoleLogger.error({
    event: 'worker.fatal',
    ...fatalSummary(error)
  });
  process.exitCode = 1;
});
