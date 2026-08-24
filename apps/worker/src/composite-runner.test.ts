import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProposalWorkerRunResult } from '@tehkarta/application';
import { RotatingCompositeProposalJobRunner } from './composite-runner.js';
import type { ProposalJobRunner } from './runtime.js';

function runner(name: string, calls: string[]): ProposalJobRunner {
  return {
    async execute(): Promise<ProposalWorkerRunResult> {
      calls.push(name);
      return {
        status: 'PROCESSED',
        jobId: `job-${name}`,
        proposalId: `proposal-${name}`,
        proposalStatus: 'READY'
      };
    }
  };
}

test('composite alternates first claim opportunity across busy job types', async () => {
  const calls: string[] = [];
  const composite = new RotatingCompositeProposalJobRunner([
    runner('decision', calls),
    runner('scenario', calls)
  ]);

  const first = await composite.execute('worker-1');
  const second = await composite.execute('worker-1');
  const third = await composite.execute('worker-1');

  assert.equal(first.status, 'PROCESSED');
  assert.equal(second.status, 'PROCESSED');
  assert.equal(third.status, 'PROCESSED');
  assert.deepEqual(calls, ['decision', 'scenario', 'decision']);
});

test('composite falls through an idle runner to the other job type', async () => {
  const calls: string[] = [];
  const idle: ProposalJobRunner = {
    async execute() {
      calls.push('idle');
      return { status: 'IDLE' };
    }
  };
  const busy = runner('busy', calls);
  const composite = new RotatingCompositeProposalJobRunner([idle, busy]);

  const result = await composite.execute('worker-1');
  assert.equal(result.status, 'PROCESSED');
  assert.deepEqual(calls, ['idle', 'busy']);
});
