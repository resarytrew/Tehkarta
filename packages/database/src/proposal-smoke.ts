import { Pool } from 'pg';
import {
  ApplicationError,
  ApplyLessonAiProposalCandidate,
  ProcessLessonDecisionProposal,
  RequestCoreDecisionAiProposal,
  RunNextLessonDecisionProposalJob,
  type LessonDecisionProposalGenerator
} from '@tehkarta/application';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import { PostgresAiInvocationRepository } from './repositories/ai-invocation.repository.js';
import { PostgresLessonAiProposalApplicationRepository } from './repositories/ai-proposal-application.repository.js';
import { PostgresLessonAiProposalRepository } from './repositories/ai-proposal.repository.js';
import { PostgresAsyncJobProcessingRepository } from './repositories/async-job.repository.js';
import { PostgresCourseRepository } from './repositories/course.repository.js';
import { PostgresLessonInvalidationRepository } from './repositories/lesson-invalidation.repository.js';
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
  const invalidations = new PostgresLessonInvalidationRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const proposalApplication = new PostgresLessonAiProposalApplicationRepository(pool);
  const jobs = new PostgresAsyncJobProcessingRepository(pool);
  const invocations = new PostgresAiInvocationRepository(pool);
  const requestProposal = new RequestCoreDecisionAiProposal({ lessons, proposals, clock, ids });
  const applyProposalCandidate = new ApplyLessonAiProposalCandidate({
    lessons,
    invalidations,
    proposals,
    application: proposalApplication,
    clock,
    ids
  });

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
        taskType: 'REFORMULATE',
        provider: 'smoke-provider',
        model: 'smoke-model',
        promptVersion: 'proposal-v1-smoke',
        routingPolicyVersion: 'routing-v2-smoke',
        inputHash: 'c7f1b3cb35d2da91a283c0aa50d8dad2e43c2928ddc92af39fb130b4a21f12ef',
        latencyMs: 320,
        inputTokens: 120,
        outputTokens: 45,
        costMicrounits: 1250,
        providerRequestId: 'provider-request-smoke-1'
      };
    }
  };

  const processor = new ProcessLessonDecisionProposal({
    lessons,
    courses,
    proposals,
    generator,
    invocations,
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

  const trace = await pool.query<{
    proposal_id: string | null;
    task_type: string;
    provider: string;
    model: string;
    prompt_version: string;
    routing_policy_version: string;
    input_hash: string;
    status: string;
    latency_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_microunits: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT proposal_id, task_type, provider, model, prompt_version,
            routing_policy_version, input_hash, status, latency_ms,
            input_tokens, output_tokens, cost_microunits, metadata
     FROM ai_invocations
     WHERE workspace_id = $1 AND proposal_id = $2`,
    [context.workspaceId, proposal.id]
  );
  const invocation = trace.rows[0];
  if (
    invocation?.proposal_id !== proposal.id ||
    invocation.task_type !== 'REFORMULATE' ||
    invocation.provider !== 'smoke-provider' ||
    invocation.model !== 'smoke-model' ||
    invocation.prompt_version !== 'proposal-v1-smoke' ||
    invocation.routing_policy_version !== 'routing-v2-smoke' ||
    invocation.input_hash !== 'c7f1b3cb35d2da91a283c0aa50d8dad2e43c2928ddc92af39fb130b4a21f12ef' ||
    invocation.status !== 'SUCCEEDED' ||
    invocation.latency_ms !== 320 ||
    invocation.input_tokens !== 120 ||
    invocation.output_tokens !== 45 ||
    invocation.cost_microunits !== '1250' ||
    invocation.metadata?.providerRequestId !== 'provider-request-smoke-1'
  ) {
    throw new Error('AI invocation trace did not preserve expected execution metadata.');
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

  const applied = await applyProposalCandidate.execute(context, {
    lessonId: 'lesson_smoke',
    proposalId: proposal.id,
    candidateId: 'candidate-1',
    expectedLessonVersion: 3
  });
  if (
    applied.lesson.version !== 4 ||
    applied.lesson.problemQuestion?.value !==
      'Почему промышленный рывок XIX века оказался столь масштабным?' ||
    applied.lesson.problemQuestion.meta.status !== 'APPROVED' ||
    applied.lesson.problemQuestion.meta.source !== 'TEACHER' ||
    applied.lesson.problemQuestion.meta.revision !== 4
  ) {
    throw new Error('Explicit teacher apply did not create the expected approved teacher revision.');
  }
  if (
    applied.proposal.status !== 'APPLIED' ||
    applied.proposal.appliedCandidateId !== 'candidate-1' ||
    applied.proposal.appliedDecisionId !== 'field_problem_smoke' ||
    applied.proposal.appliedDecisionRevision !== 4 ||
    applied.proposal.appliedBy !== 'usr_smoke'
  ) {
    throw new Error('Applied AI proposal provenance was not persisted.');
  }

  const revision = await pool.query<{
    source: string;
    status: string;
    actor_user_id: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT source, status, actor_user_id, reason, metadata
     FROM lesson_decision_revisions
     WHERE workspace_id = $1 AND decision_id = 'field_problem_smoke' AND revision = 4`,
    [context.workspaceId]
  );
  const appliedRevision = revision.rows[0];
  if (
    appliedRevision?.source !== 'TEACHER' ||
    appliedRevision.status !== 'APPROVED' ||
    appliedRevision.actor_user_id !== 'usr_smoke' ||
    appliedRevision.metadata?.origin !== 'AI_PROPOSAL' ||
    appliedRevision.metadata?.proposalId !== proposal.id ||
    appliedRevision.metadata?.candidateId !== 'candidate-1' ||
    appliedRevision.metadata?.provider !== 'smoke-provider' ||
    appliedRevision.metadata?.model !== 'smoke-model' ||
    appliedRevision.metadata?.promptVersion !== 'proposal-v1-smoke'
  ) {
    throw new Error('Teacher revision did not retain the expected AI proposal provenance metadata.');
  }

  const applyInvalidations = applied.invalidations.filter(
    (item) => item.sourceDecisionId === 'field_problem_smoke' && item.sourceRevision === 4
  );
  if (!applyInvalidations.some((item) => item.affectedSemanticKey === 'bigIdea')) {
    throw new Error('Applying an AI candidate did not invalidate dependent lesson artifacts.');
  }

  const idempotentApply = await applyProposalCandidate.execute(context, {
    lessonId: 'lesson_smoke',
    proposalId: proposal.id,
    candidateId: 'candidate-1',
    expectedLessonVersion: 3
  });
  if (
    idempotentApply.lesson.version !== 4 ||
    idempotentApply.proposal.status !== 'APPLIED' ||
    idempotentApply.proposal.appliedCandidateId !== 'candidate-1'
  ) {
    throw new Error('Retrying the same explicit teacher apply was not idempotent.');
  }

  let differentCandidateRejected = false;
  try {
    await applyProposalCandidate.execute(context, {
      lessonId: 'lesson_smoke',
      proposalId: proposal.id,
      candidateId: 'candidate-other',
      expectedLessonVersion: 4
    });
  } catch (error: unknown) {
    differentCandidateRejected = error instanceof ApplicationError && error.code === 'CONFLICT';
  }
  if (!differentCandidateRejected) {
    throw new Error('An already applied proposal accepted a different candidate on retry.');
  }

  const staleCandidate = await requestProposal.execute(context, {
    lessonId: 'lesson_smoke',
    semanticKey: 'problemQuestion',
    action: 'VARIANTS',
    expectedLessonVersion: 4,
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

  const staleTrace = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM ai_invocations
     WHERE workspace_id = $1 AND proposal_id = $2`,
    [context.workspaceId, staleCandidate.id]
  );
  if (staleTrace.rows[0]?.count !== '0') {
    throw new Error('A stale proposal recorded an AI invocation even though the model was skipped.');
  }

  const firstJobAfter = await pool.query<{ status: string; result_json: unknown }>(
    `SELECT status, result_json FROM async_jobs WHERE id = $1`,
    [proposal.asyncJobId]
  );
  if (firstJobAfter.rows[0]?.status !== 'SUCCEEDED') {
    throw new Error('Successfully generated proposal did not complete its async job.');
  }

  console.info('[database] AI proposal queue + trace + explicit teacher apply smoke test passed');
} finally {
  await pool.end();
}
