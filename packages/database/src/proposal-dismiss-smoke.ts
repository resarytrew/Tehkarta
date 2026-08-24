import { Pool } from 'pg';
import {
  DismissLessonAiProposal,
  RequestCoreDecisionAiProposal
} from '@tehkarta/application';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import { PostgresLessonAiProposalRepository } from './repositories/ai-proposal.repository.js';
import { PostgresLessonRepository } from './repositories/lesson.repository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for AI proposal dismissal smoke test.');

await migrateDatabase({ databaseUrl });

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const now = new Date('2026-08-24T04:40:00.000Z');
const clock: Clock = { now: () => new Date(now) };
let issuedId = 0;
const ids: IdGenerator = { generate: (prefix = 'id') => `${prefix}_dismiss_smoke_${++issuedId}` };
const context: RequestContext = {
  requestId: 'req_proposal_dismiss_smoke',
  workspaceId: 'ws_smoke',
  actorUserId: 'usr_smoke',
  roles: ['OWNER'],
  permissions: ['lesson:read', 'lesson:write']
};

try {
  const lessons = new PostgresLessonRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const requestProposal = new RequestCoreDecisionAiProposal({ lessons, proposals, clock, ids });
  const dismissProposal = new DismissLessonAiProposal({ lessons, proposals, clock });

  const before = await lessons.getById(context, 'lesson_smoke');
  if (!before?.problemQuestion) {
    throw new Error('Dismissal smoke fixture is missing the problem question.');
  }

  const queued = await requestProposal.execute(context, {
    lessonId: before.id,
    semanticKey: 'problemQuestion',
    action: 'VARIANTS',
    expectedLessonVersion: before.version,
    candidateCount: 1,
    requestKey: 'proposal-dismiss-smoke-request-0001'
  });

  await proposals.markRunning(context, { proposalId: queued.id, now: now.toISOString() });
  const ready = await proposals.markReady(context, {
    proposalId: queued.id,
    candidates: [
      {
        id: 'candidate-dismiss-1',
        value: 'Почему индустриальная экономика XIX века развивалась столь быстро?',
        rationale: 'Проверочный вариант для сценария явного отклонения.'
      }
    ],
    provider: 'smoke-provider',
    model: 'smoke-model',
    promptVersion: 'dismiss-smoke-v1',
    routingPolicyVersion: 'routing-smoke-v1',
    now: now.toISOString()
  });
  if (ready.status !== 'READY') throw new Error('Dismissal smoke proposal did not become READY.');

  await pool.query(
    `UPDATE async_jobs
     SET status = 'SUCCEEDED', completed_at = $2, updated_at = $2
     WHERE workspace_id = $1 AND id = $3`,
    [context.workspaceId, now, queued.asyncJobId]
  );

  const dismissed = await dismissProposal.execute(context, {
    lessonId: before.id,
    proposalId: ready.id
  });
  if (
    dismissed.status !== 'DISMISSED' ||
    dismissed.dismissedBy !== context.actorUserId ||
    dismissed.dismissedAt !== now.toISOString()
  ) {
    throw new Error('Explicit proposal dismissal provenance was not persisted.');
  }

  const after = await lessons.getById(context, before.id);
  if (
    after?.version !== before.version ||
    after.problemQuestion?.fieldId !== before.problemQuestion.fieldId ||
    after.problemQuestion?.meta.revision !== before.problemQuestion.meta.revision ||
    after.problemQuestion?.value !== before.problemQuestion.value
  ) {
    throw new Error('Dismissing an AI proposal mutated authoritative lesson state.');
  }

  const repeated = await dismissProposal.execute(context, {
    lessonId: before.id,
    proposalId: ready.id
  });
  if (repeated.status !== 'DISMISSED' || repeated.id !== ready.id) {
    throw new Error('Repeated dismissal was not idempotent.');
  }

  const history = await proposals.listByLesson(context, before.id, 'problemQuestion');
  if (!history.some((item) => item.id === ready.id && item.status === 'DISMISSED')) {
    throw new Error('Dismissed proposal was not retained in field history.');
  }

  console.info('[database] AI proposal explicit dismissal + history smoke test passed');
} finally {
  await pool.end();
}
