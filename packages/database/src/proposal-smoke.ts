import { Pool } from 'pg';
import {
  ApplicationError,
  ProcessLessonDecisionProposal,
  RequestCoreDecisionAiProposal,
  RunNextLessonDecisionProposalJob,
  type LessonDecisionProposalGenerator
} from '@tehkarta/application';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import { PostgresLessonAiProposalRepository } from './repositories/ai-proposal.repository.js';
import { PostgresAsyncJobProcessingRepository } from './repositories/async-job.repository.js';
import { PostgresCourseRepository } from './repositories/course.repository.js';
import { PostgresLessonRepository } from './repositories/lesson.repository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for AI proposal smoke test.');

await migrateDatabase({ databaseUrl });

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
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

const teacherInstruction =
  'Сделай вопрос короче, но сохрани причинно-следственный характер.';

try {
  const lessons = new PostgresLessonRepository(pool);
  const courses = new PostgresCourseRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const jobs = new PostgresAsyncJobProcessingRepository(pool);
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
    teacherInstruction,
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
    teacherInstruction,
    requestKey: 'proposal-smoke-request-0001'
  });
  if (repeated.id !== proposal.id || repeated.asyncJobId !== proposal.asyncJobId) {
    throw new Error('AI proposal idempotency did not return the existing request.');
  }

  let conflictingReplayRejected = false;
  try {
    await requestProposal.execute(context, {
      lessonId: 'lesson_smoke',
      semanticKey: 'problemQuestion',
      action: 'VARIANTS',
      expectedLessonVersion: 3,
      candidateCount: 3,
      requestKey: 'proposal-smoke-request-0001'
    });
  } catch (error: unknown) {
    conflictingReplayRejected =
      error instanceof ApplicationError && error.code === 'CONFLICT';
  }
  if (!conflictingReplayRejected) {
    throw new Error('Reusing an AI proposal idempotency key for a different request was not rejected.');
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

  let generationCalls = 0;
  const generator: LessonDecisionProposalGenerator = {
    async generate(input) {
      generationCalls += 1;
      if (
        input.targetValue !== 'Почему в XIX в. промышленная революция достигла огромных успехов?'
      ) {
        throw new Error('Worker did not receive the exact target value captured by teacher state.');
      }
      if (
        input.context.approvedProblemQuestion !==
        'Почему в XIX в. промышленная революция достигла огромных успехов?'
      ) {
        throw new Error('Approved teacher problem question was absent from generation context.');
      }
      if (Object.keys(input.context.approvedPedagogicalProfile).length !== 0) {
        throw new Error('Unapproved pedagogical profile data leaked into AI generation context.');
      }

      return {
        candidates: [
          {
            id: 'candidate-1',
            value: 'Почему промышленный рывок XIX века оказался столь масштабным?',
            rationale: 'Формулировка короче и сохраняет причинно-следственный характер.'
          }
        ],
        provider: 'smoke-provider',
        model: 'smoke-model',
        promptVersion: 'proposal-v1-smoke',
        routingPolicyVersion: 'routing-v1-smoke'
      };
    }
  };

  const processor = new ProcessLessonDecisionProposal({
    lessons,
    courses,
    proposals,
    generator,
    clock
  });
  const runner = new RunNextLessonDecisionProposalJob({ jobs, proposals, processor, clock });

  const processed = await runner.execute('worker-smoke-1');
  if (
    processed.status !== 'PROCESSED' ||
    processed.proposalId !== proposal.id ||
    processed.proposalStatus !== 'READY'
  ) {
    throw new Error('Worker did not complete the queued AI proposal as READY.');
  }
  if (generationCalls !== 1) {
    throw new Error('AI proposal worker did not invoke the generator exactly once.');
  }

  const ready = await proposals.getById(context, proposal.id);
  if (
    ready?.status !== 'READY' ||
    ready.candidates[0]?.value !== 'Почему промышленный рывок XIX века оказался столь масштабным?' ||
    ready.provider !== 'smoke-provider'
  ) {
    throw new Error('Generated candidates were not persisted as a separate READY proposal.');
  }

  const authoritativeAfterGeneration = await lessons.getById(context, 'lesson_smoke');
  if (
    authoritativeAfterGeneration?.version !== 3 ||
    authoritativeAfterGeneration.problemQuestion?.meta.status !== 'APPROVED' ||
    authoritativeAfterGeneration.problemQuestion.meta.revision !== 3 ||
    authoritativeAfterGeneration.problemQuestion.value !==
      'Почему в XIX в. промышленная революция достигла огромных успехов?'
  ) {
    throw new Error('AI worker modified authoritative teacher state while generating a proposal.');
  }

  const staleCandidate = await requestProposal.execute(context, {
    lessonId: 'lesson_smoke',
    semanticKey: 'problemQuestion',
    action: 'VARIANTS',
    expectedLessonVersion: 3,
    candidateCount: 3,
    requestKey: 'proposal-smoke-request-0002'
  });

  await pool.query(
    `UPDATE lessons
     SET version = version + 1, updated_at = now()
     WHERE id = 'lesson_smoke' AND workspace_id = 'ws_smoke'`
  );

  const staleRun = await runner.execute('worker-smoke-1');
  if (
    staleRun.status !== 'PROCESSED' ||
    staleRun.proposalId !== staleCandidate.id ||
    staleRun.proposalStatus !== 'STALE'
  ) {
    throw new Error('Worker did not mark a proposal stale after lesson state changed.');
  }
  if (generationCalls !== 1) {
    throw new Error('Stale AI proposal incorrectly invoked the generator.');
  }

  const stale = await proposals.getById(context, staleCandidate.id);
  if (stale?.status !== 'STALE') {
    throw new Error('Stale proposal state was not persisted.');
  }

  const firstJobAfter = await pool.query<{ status: string; result_json: unknown }>(
    `SELECT status, result_json FROM async_jobs WHERE id = $1`,
    [proposal.asyncJobId]
  );
  if (firstJobAfter.rows[0]?.status !== 'SUCCEEDED') {
    throw new Error('Successfully generated proposal did not complete its async job.');
  }

  console.info('[database] AI proposal queue + worker safety smoke test passed');
} finally {
  await pool.end();
}
