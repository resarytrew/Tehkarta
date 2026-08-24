import type { ProposalWorkerRunResult } from '@tehkarta/application';

export interface ProposalJobRunner {
  execute(workerId: string): Promise<ProposalWorkerRunResult>;
}

export interface WorkerLogger {
  info(event: Readonly<Record<string, unknown>>): void;
  error(event: Readonly<Record<string, unknown>>): void;
}

export interface WorkerRuntimeOptions {
  workerId: string;
  pollIntervalMs: number;
  maxRuntimeBackoffMs?: number;
}

function resultMetadata(result: ProposalWorkerRunResult): Readonly<Record<string, unknown>> {
  switch (result.status) {
    case 'IDLE':
      return { status: result.status };
    case 'PROCESSED':
      return {
        status: result.status,
        jobId: result.jobId,
        proposalId: result.proposalId,
        proposalStatus: result.proposalStatus
      };
    case 'RETRY_SCHEDULED':
    case 'FAILED':
      return {
        status: result.status,
        jobId: result.jobId,
        ...(result.proposalId ? { proposalId: result.proposalId } : {})
      };
  }
}

function safeRuntimeError(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      // Runtime-level failures should be infrastructure/configuration failures.
      // Provider response payloads are handled inside the application runner and
      // intentionally never reach this logger.
      errorMessage: error.message.slice(0, 500)
    };
  }
  return { errorName: 'UnknownError' };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    timer.unref?.();
  });
}

export class WorkerRuntime {
  private readonly maxRuntimeBackoffMs: number;

  constructor(
    private readonly runner: ProposalJobRunner,
    private readonly logger: WorkerLogger,
    private readonly options: WorkerRuntimeOptions
  ) {
    this.maxRuntimeBackoffMs = options.maxRuntimeBackoffMs ?? 30_000;
  }

  async runOnce(): Promise<ProposalWorkerRunResult> {
    const result = await this.runner.execute(this.options.workerId);
    this.logger.info({
      event: 'worker.iteration.completed',
      workerId: this.options.workerId,
      ...resultMetadata(result)
    });
    return result;
  }

  async runUntilStopped(signal: AbortSignal): Promise<void> {
    let runtimeFailures = 0;
    this.logger.info({
      event: 'worker.polling.started',
      workerId: this.options.workerId,
      pollIntervalMs: this.options.pollIntervalMs
    });

    while (!signal.aborted) {
      try {
        const result = await this.runOnce();
        runtimeFailures = 0;
        if (result.status === 'IDLE') {
          await abortableDelay(this.options.pollIntervalMs, signal);
        }
      } catch (error) {
        runtimeFailures += 1;
        const delayMs = Math.min(
          this.maxRuntimeBackoffMs,
          this.options.pollIntervalMs * 2 ** Math.min(runtimeFailures, 8)
        );
        this.logger.error({
          event: 'worker.iteration.infrastructure_failed',
          workerId: this.options.workerId,
          retryInMs: delayMs,
          ...safeRuntimeError(error)
        });
        await abortableDelay(delayMs, signal);
      }
    }

    this.logger.info({
      event: 'worker.polling.stopped',
      workerId: this.options.workerId
    });
  }
}

export const jsonConsoleLogger: WorkerLogger = {
  info(event) {
    console.info(JSON.stringify({ level: 'info', ...event }));
  },
  error(event) {
    console.error(JSON.stringify({ level: 'error', ...event }));
  }
};
