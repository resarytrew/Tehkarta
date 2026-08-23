import { Pool } from 'pg';
import { RequestCoreDecisionAiProposal } from '@tehkarta/application';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import { PostgresLessonAiProposalRepository } from './repositories/ai-proposal.repository.js';
import { PostgresLessonRepository } from './repositories/lesson.repository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for AI proposal smoke test.');

await migrateDatabase({ databaseUrl });

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const fixedNow = new Date('2026-08-23T18:00:00.000Z');
const clock: Clock = { now: () => new Date(fixedNow) };
let issuedId = 0;
const ids: IdGenerator = { generate: (prefix = 'id') => `${prefix}_proposal_smoke_${++issuedId}` };

const context: RequestContext = {
  requestId: 'req_proposal_smoke',
  workspaceId: 'ws_smoke',
  actorUserId: 'usr_smoke',
  roles: ['OWNER'],
  permissions: ['lesson:read', 'lesson:write']
};

try {
  const lessons = new PostgresLessonRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const requestProposal = new RequestCoreDecisionAiProposal({ lessons, proposals, clock, ids });

  const before = await lessons.getById(context, 'lesson_smoke');
  if (
    before?.version !== 3 ||
    before.problemQuestion?.meta.status !== 'APPROVED' ||
    before.problemQuestion.meta.revision !== 3
  ) {
    throw new Error('AI proposal smoke fixture does not have the expected approved teacher state.');
  }

  const proposal = await requestProposal.execute(context, {
    lessonId: 'lesson_smoke',
    semanticKey: 'problemQuestion',
    action: 'IMPROVE',
    expectedLessonVersion: 3,
    candidateCount: 1,
    teacherInstruction: 'Сделай вопрос короче, но сохрани причинно-следственный характер.',
    requestKey: 'proposal-smoke-request-0001'
  });

  if (
    proposal.status !== 'QUEUED' ||
    proposal.baseDecisionId !== 'field_problem_smoke' ||
    proposal.baseRevision !== 3 ||
    proposal.requestedLessonVersion !== 3 ||
    proposal.action !== 'IMPROVE'
  ) {
    throw new Error('AI proposal request was not persisted with the expected safety boundary.');
  }

  const after = await lessons.getById(context, 'lesson_smoke');
  if (
    after?.version !== before.version ||
    after.problemQuestion?.value !== before.problemQuestion.value ||
    after.problemQuestion?.meta.revision !== before.problemQuestion.meta.revision ||
    after.problemQuestion?.meta.status !== 'APPROVED'
  ) {
    throw new Error('Queuing an AI proposal mutated the authoritative teacher decision.');
  }

  const job = await pool.query<{ status: string; job_type: string; payload_json: unknown }>(
    `SELECT status, job_type, payload_json
     FROM async_jobs
     WHERE id = $1 AND workspace_id = $2`,
    [proposal.asyncJobId, context.workspaceId]
  );
  if (job.rows[0]?.status !== 'QUEUED' || job.rows[0]?.job_type !== 'LESSON_DECISION_PROPOSAL') {
    throw new Error('AI proposal did not create the expected async job.');
  }

  const repeated = await requestProposal.execute(context, {
    lessonId: 'lesson_smoke',
    semanticKey: 'problemQuestion',
    action: 'IMPROVE',
    expectedLessonVersion: 3,
    candidateCount: 1,
    requestKey: 'proposal-smoke-request-0001'
  });
  if (repeated.id !== proposal.id || repeated.asyncJobId !== proposal.asyncJobId) {
    throw new Error('AI proposal idempotency did not return the existing request.');
  }

  const listed = await proposals.listByLesson(context, 'lesson_smoke', 'problemQuestion');
  if (!listed.some((item) => item.id === proposal.id)) {
    throw new Error('Queued AI proposal was not visible through the repository listing.');
  }

  const otherWorkspaceContext: RequestContext = {
    ...context,
    requestId: 'req_proposal_other',
    workspaceId: 'ws_other'
  };
  const leaked = await proposals.listByLesson(otherWorkspaceContext, 'lesson_smoke');
  if (leaked.length !== 0) {
    throw new Error('AI proposal leaked across workspace boundaries.');
  }

  console.info('[database] AI proposal isolation + queue smoke test passed');
} finally {
  await pool.end();
}
