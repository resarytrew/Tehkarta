import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProposalWorkerRunResult } from '@tehkarta/application';
import { WorkerRuntime, type ProposalJobRunner, type WorkerLogger } from './runtime.js';

function captureLogger(): { logger: WorkerLogger; events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    logger: {
      info(event) {
        events.push({ level: 'info', ...event });
      },
      error(event) {
        events.push({ level: 'error', ...event });
      }
    }
  };
}

test('runOnce passes stable worker identity and logs only result metadata', async () => {
  const calls: string[] = [];
  const runner: ProposalJobRunner = {
    async execute(workerId): Promise<ProposalWorkerRunResult> {
      calls.push(workerId);
      return {
        status: 'PROCESSED',
        jobId: 'job-1',
        proposalId: 'proposal-1',
        proposalStatus: 'READY'
      };
    }
  };
  const { logger, events } = captureLogger();
  const runtime = new WorkerRuntime(runner, logger, {
    workerId: 'worker-test-1',
    pollIntervalMs: 100
  });

  const result = await runtime.runOnce();

  assert.equal(result.status, 'PROCESSED');
  assert.deepEqual(calls, ['worker-test-1']);
  assert.equal(events[0]?.event, 'worker.iteration.completed');
  assert.equal(events[0]?.jobId, 'job-1');
  assert.equal(events[0]?.proposalId, 'proposal-1');
  assert.equal('prompt' in (events[0] ?? {}), false);
});

test('polling runtime stops promptly after abort and does not claim more work', async () => {
  const controller = new AbortController();
  let calls = 0;
  const runner: ProposalJobRunner = {
    async execute(): Promise<ProposalWorkerRunResult> {
      calls += 1;
      if (calls === 1) return { status: 'IDLE' };
      controller.abort();
      return {
        status: 'PROCESSED',
        jobId: 'job-2',
        proposalId: 'proposal-2',
        proposalStatus: 'READY'
      };
    }
  };
  const { logger, events } = captureLogger();
  const runtime = new WorkerRuntime(runner, logger, {
    workerId: 'worker-test-2',
    pollIntervalMs: 1
  });

  await runtime.runUntilStopped(controller.signal);

  assert.equal(calls, 2);
  assert.equal(events.some((event) => event.event === 'worker.polling.started'), true);
  assert.equal(events.some((event) => event.event === 'worker.polling.stopped'), true);
});

test('polling runtime recovers from infrastructure failures with bounded backoff', async () => {
  const controller = new AbortController();
  let calls = 0;
  const runner: ProposalJobRunner = {
    async execute(): Promise<ProposalWorkerRunResult> {
      calls += 1;
      if (calls === 1) throw new Error('temporary database outage');
      controller.abort();
      return { status: 'IDLE' };
    }
  };
  const { logger, events } = captureLogger();
  const runtime = new WorkerRuntime(runner, logger, {
    workerId: 'worker-test-3',
    pollIntervalMs: 1,
    maxRuntimeBackoffMs: 2
  });

  await runtime.runUntilStopped(controller.signal);

  assert.equal(calls, 2);
  const failure = events.find((event) => event.event === 'worker.iteration.infrastructure_failed');
  assert.equal(failure?.retryInMs, 2);
});
