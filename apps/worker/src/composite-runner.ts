import type { ProposalWorkerRunResult } from '@tehkarta/application';
import type { ProposalJobRunner } from './runtime.js';

/**
 * Rotates the runner that gets first claim opportunity on each iteration. This
 * prevents a permanently busy job type from starving the other durable AI
 * workflows while keeping each underlying runner one-shot and independently
 * testable.
 */
export class RotatingCompositeProposalJobRunner implements ProposalJobRunner {
  private startIndex = 0;

  constructor(private readonly runners: readonly ProposalJobRunner[]) {
    if (runners.length === 0) throw new Error('Composite worker requires at least one runner.');
  }

  async execute(workerId: string): Promise<ProposalWorkerRunResult> {
    const first = this.startIndex % this.runners.length;
    this.startIndex = (this.startIndex + 1) % this.runners.length;

    for (let offset = 0; offset < this.runners.length; offset += 1) {
      const runner = this.runners[(first + offset) % this.runners.length];
      if (!runner) continue;
      const result = await runner.execute(workerId);
      if (result.status !== 'IDLE') return result;
    }

    return { status: 'IDLE' };
  }
}
