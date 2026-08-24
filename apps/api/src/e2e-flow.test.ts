import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  ProcessLessonDecisionProposal,
  RunNextLessonDecisionProposalJob,
  type LessonDecisionProposalGenerator
} from '@tehkarta/application';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  migrateDatabase,
  PostgresAiInvocationRepository,
  PostgresAsyncJobProcessingRepository,
  PostgresCourseRepository,
  PostgresIdentityRepository,
  PostgresLessonAiProposalApplicationRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonInvalidationRepository,
  PostgresLessonRepository,
  PostgresLoginThrottleRepository,
  PostgresPasswordCredentialRepository,
  PostgresSessionRepository
} from '@tehkarta/database';
import {
  Argon2idPasswordHasher,
  LoginThrottleService,
  NodeSessionTokenCodec,
  PasswordLoginService,
  SessionService,
  WorkspaceAuthorizationPolicy
} from '@tehkarta/identity';
import type { Clock, IdGenerator } from '@tehkarta/ports';
import { createApiApp } from './app.js';
import type { ApiConfig } from './config.js';
import { hashLoginPrincipal } from './security.js';

const databaseUrl = process.env.DATABASE_URL;
const maybeTest = databaseUrl ? test : test.skip;

maybeTest('HTTP login → approve → AI worker → READY → explicit Apply persists teacher authority', async () => {
  if (!databaseUrl) return;
  await migrateDatabase({ databaseUrl });

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const ids = {
    user: `usr_e2e_${suffix}`,
    workspace: `ws_e2e_${suffix}`,
    source: `src_e2e_${suffix}`,
    curriculumPack: `cur_pack_e2e_${suffix}`,
    curriculumCourse: `cur_course_e2e_${suffix}`,
    curriculumSection: `cur_section_e2e_${suffix}`,
    curriculumLesson: `cur_lesson_e2e_${suffix}`,
    contentPack: `content_e2e_${suffix}`,
    course: `course_e2e_${suffix}`,
    section: `section_e2e_${suffix}`,
    lesson: `lesson_e2e_${suffix}`
  };
  const email = `teacher-${suffix}@example.test`;
  const password = `E2E-${suffix}-password-strong`;
  const authKey = 'e2e-auth-ip-hash-key-at-least-32-characters-long';
  const pool = createPostgresPool({
    ...databaseConfigFromEnv({ DATABASE_URL: databaseUrl }),
    applicationName: 'tehkarta-e2e-test',
    maxConnections: 4
  });

  const passwordHasher = new Argon2idPasswordHasher();
  const passwordHash = await passwordHasher.hash(password);
  await pool.query(
    `INSERT INTO users(id, email, normalized_email, display_name)
     VALUES ($1, $2, $2, 'E2E Teacher');

     INSERT INTO password_credentials(user_id, password_hash, algorithm, password_updated_at)
     VALUES ($1, $3, 'argon2id', now());

     INSERT INTO workspaces(id, slug, name, created_by)
     VALUES ($4, $5, 'E2E workspace', $1);

     INSERT INTO workspace_memberships(workspace_id, user_id, role, permissions)
     VALUES ($4, $1, 'OWNER', '["course:read","course:write","lesson:read","lesson:write"]'::jsonb);

     INSERT INTO source_documents(
       id, source_kind, title, version, mime_type, checksum_sha256, rights_basis, processing_status
     ) VALUES ($6, 'CURRICULUM', 'E2E curriculum', '1', 'application/json', $7, 'TEST_FIXTURE', 'READY');

     INSERT INTO curriculum_packs(
       id, subject, grade_min, grade_max, academic_year, version, status, title, source_document_id
     ) VALUES ($8, 'История', 9, 9, '2026/27', '1', 'PUBLISHED', 'E2E curriculum pack', $6);

     INSERT INTO curriculum_courses(id, curriculum_pack_id, subject, grade, title, ordinal, planned_hours)
     VALUES ($9, $8, 'История', 9, 'Всеобщая история. История Нового времени. XIX — начало XX в.', 1, 23);

     INSERT INTO curriculum_sections(id, curriculum_course_id, title, ordinal, planned_hours)
     VALUES ($10, $9, 'Начало индустриальной эпохи', 1, 7);

     INSERT INTO curriculum_lessons(id, curriculum_section_id, title, ordinal, planned_hours, duration_minutes)
     VALUES ($11, $10, 'Экономика делает решающий рывок', 1, 1, 45);

     INSERT INTO content_packs(
       id, subject, grade, academic_year, version, status, title, curriculum_pack_id
     ) VALUES ($12, 'История', 9, '2026/27', '1', 'PUBLISHED', 'E2E UMK fixture', $8);

     INSERT INTO courses(
       id, workspace_id, owner_user_id, curriculum_course_id,
       curriculum_pack_id, curriculum_pack_version, content_pack_id, content_pack_version,
       subject, grade, academic_year, title, created_by
     ) VALUES ($13, $4, $1, $9, $8, '1', $12, '1', 'История', 9, '2026/27',
       'Всеобщая история. История Нового времени. XIX — начало XX в.', $1);

     INSERT INTO course_sections(
       id, workspace_id, course_id, curriculum_section_id, position, title, planned_hours
     ) VALUES ($14, $4, $13, $10, 1, 'Начало индустриальной эпохи', 7);

     INSERT INTO lessons(
       id, workspace_id, course_id, section_id, curriculum_lesson_id,
       position, title, duration_minutes, created_by
     ) VALUES ($15, $4, $13, $14, $11, 1, 'Экономика делает решающий рывок', 45, $1);`,
    [
      ids.user,
      email,
      passwordHash,
      ids.workspace,
      `e2e-${suffix}`,
      ids.source,
      `e2e-checksum-${suffix}`,
      ids.curriculumPack,
      ids.curriculumCourse,
      ids.curriculumSection,
      ids.curriculumLesson,
      ids.contentPack,
      ids.course,
      ids.section,
      ids.lesson
    ]
  );

  const clock: Clock = { now: () => new Date() };
  const idGenerator: IdGenerator = {
    generate: (prefix = 'id') => `${prefix}_e2e_${randomUUID()}`
  };
  const identities = new PostgresIdentityRepository(pool);
  const sessionRepository = new PostgresSessionRepository(pool);
  const sessions = new SessionService({
    identities,
    sessions: sessionRepository,
    tokens: new NodeSessionTokenCodec(),
    clock,
    ids: idGenerator
  });
  const passwordLogin = new PasswordLoginService({
    identities,
    credentials: new PostgresPasswordCredentialRepository(pool),
    passwords: passwordHasher,
    sessions,
    throttle: new LoginThrottleService(new PostgresLoginThrottleRepository(pool)),
    clock,
    principalHasher: (normalizedEmail) => hashLoginPrincipal(normalizedEmail, authKey),
    dummyPasswordHash: await passwordHasher.hash(`dummy-${suffix}-credential`)
  });

  const courses = new PostgresCourseRepository(pool);
  const lessons = new PostgresLessonRepository(pool);
  const invalidations = new PostgresLessonInvalidationRepository(pool);
  const proposals = new PostgresLessonAiProposalRepository(pool);
  const proposalApplication = new PostgresLessonAiProposalApplicationRepository(pool);
  const config: ApiConfig = {
    host: '127.0.0.1',
    port: 0,
    environment: 'test',
    allowedOrigins: ['http://localhost:5173'],
    sessionCookieName: 'tehkarta_session',
    secureCookies: false,
    sessionTtlSeconds: 3600,
    authIpHashKey: authKey,
    trustProxy: false
  };
  const app = await createApiApp(config, {
    sessions,
    passwordLogin,
    courses,
    lessons,
    invalidations,
    proposals,
    proposalApplication,
    authorization: new WorkspaceAuthorizationPolicy(),
    clock,
    ids: idGenerator
  });

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password }
    });
    assert.equal(login.statusCode, 200, login.body);
    const loginBody = login.json<{
      csrfToken: string;
      memberships: Array<{ workspaceId: string }>;
    }>();
    assert.equal(loginBody.memberships[0]?.workspaceId, ids.workspace);
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0];
    assert.ok(cookie, 'Login did not set the session cookie.');

    const commonHeaders = {
      cookie,
      'x-workspace-id': ids.workspace,
      'x-csrf-token': loginBody.csrfToken
    };

    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/lessons/${ids.lesson}/decisions/problemQuestion`,
      headers: commonHeaders,
      payload: {
        value: 'Почему в XIX в. промышленная революция достигла огромных успехов?',
        expectedLessonVersion: 1
      }
    });
    assert.equal(edit.statusCode, 200, edit.body);
    const editedLesson = edit.json<{ data: { version: number; problemQuestion: { meta: { revision: number; status: string } } } }>().data;
    assert.equal(editedLesson.version, 2);
    assert.equal(editedLesson.problemQuestion.meta.status, 'EDITED');

    const approve = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/decisions/problemQuestion/approve`,
      headers: commonHeaders,
      payload: {
        expectedLessonVersion: 2,
        expectedFieldRevision: editedLesson.problemQuestion.meta.revision
      }
    });
    assert.equal(approve.statusCode, 200, approve.body);
    const approvedLesson = approve.json<{ data: { version: number; problemQuestion: { value: string; meta: { revision: number; status: string } } } }>().data;
    assert.equal(approvedLesson.version, 3);
    assert.equal(approvedLesson.problemQuestion.meta.status, 'APPROVED');
    assert.equal(
      approvedLesson.problemQuestion.value,
      'Почему в XIX в. промышленная революция достигла огромных успехов?'
    );

    const rejectedWithoutCsrf = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/ai-proposals`,
      headers: { cookie, 'x-workspace-id': ids.workspace },
      payload: {
        semanticKey: 'problemQuestion',
        action: 'IMPROVE',
        expectedLessonVersion: 3,
        candidateCount: 1,
        requestKey: `e2e-no-csrf-${suffix}`
      }
    });
    assert.equal(rejectedWithoutCsrf.statusCode, 403);

    const requestKey = `e2e-proposal-${suffix}`;
    const queued = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/ai-proposals`,
      headers: commonHeaders,
      payload: {
        semanticKey: 'problemQuestion',
        action: 'IMPROVE',
        expectedLessonVersion: 3,
        candidateCount: 1,
        teacherInstruction: 'Сохрани причинно-следственный характер вопроса.',
        requestKey
      }
    });
    assert.equal(queued.statusCode, 202, queued.body);
    const queuedProposal = queued.json<{ data: { id: string; asyncJobId: string; status: string } }>().data;
    assert.equal(queuedProposal.status, 'QUEUED');

    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/ai-proposals`,
      headers: commonHeaders,
      payload: {
        semanticKey: 'problemQuestion',
        action: 'IMPROVE',
        expectedLessonVersion: 3,
        candidateCount: 1,
        teacherInstruction: 'Сохрани причинно-следственный характер вопроса.',
        requestKey
      }
    });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(replay.json<{ data: { id: string } }>().data.id, queuedProposal.id);

    const generator: LessonDecisionProposalGenerator = {
      async generate(input) {
        assert.equal(
          input.context.approvedProblemQuestion,
          'Почему в XIX в. промышленная революция достигла огромных успехов?'
        );
        return {
          candidates: [{
            id: 'candidate-1',
            value: 'Почему промышленная революция XIX века достигла такого масштаба?',
            rationale: 'Сохраняет причинный поиск и делает формулировку компактнее.'
          }],
          taskType: 'REFORMULATE',
          provider: 'e2e-provider',
          model: 'e2e-model',
          promptVersion: 'e2e-prompt-v1',
          routingPolicyVersion: 'e2e-routing-v1',
          inputHash: 'e2e-input-hash',
          latencyMs: 10
        };
      }
    };
    const processor = new ProcessLessonDecisionProposal({
      lessons,
      courses,
      proposals,
      generator,
      invocations: new PostgresAiInvocationRepository(pool),
      clock
    });
    const runner = new RunNextLessonDecisionProposalJob({
      jobs: new PostgresAsyncJobProcessingRepository(pool),
      proposals,
      processor,
      clock
    });
    const processed = await runner.execute(`worker-e2e-${suffix}`);
    assert.equal(processed.status, 'PROCESSED');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/ai-proposals/${queuedProposal.id}`,
      headers: { cookie, 'x-workspace-id': ids.workspace }
    });
    assert.equal(detail.statusCode, 200, detail.body);
    const ready = detail.json<{ data: { status: string; candidates: Array<{ id: string; value: string }> } }>().data;
    assert.equal(ready.status, 'READY');
    assert.equal(ready.candidates[0]?.id, 'candidate-1');

    const beforeApply = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}`,
      headers: { cookie, 'x-workspace-id': ids.workspace }
    });
    assert.equal(beforeApply.statusCode, 200);
    assert.equal(
      beforeApply.json<{ data: { problemQuestion: { value: string } } }>().data.problemQuestion.value,
      'Почему в XIX в. промышленная революция достигла огромных успехов?'
    );

    const applied = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/ai-proposals/${queuedProposal.id}/apply`,
      headers: commonHeaders,
      payload: { candidateId: 'candidate-1', expectedLessonVersion: 3 }
    });
    assert.equal(applied.statusCode, 200, applied.body);
    const appliedBody = applied.json<{
      data: { version: number; problemQuestion: { value: string; meta: { source: string; status: string } } };
      proposal: { status: string; appliedCandidateId: string };
    }>();
    assert.equal(appliedBody.data.version, 4);
    assert.equal(appliedBody.data.problemQuestion.meta.source, 'TEACHER');
    assert.equal(appliedBody.data.problemQuestion.meta.status, 'APPROVED');
    assert.equal(
      appliedBody.data.problemQuestion.value,
      'Почему промышленная революция XIX века достигла такого масштаба?'
    );
    assert.equal(appliedBody.proposal.status, 'APPLIED');

    const reloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}`,
      headers: { cookie, 'x-workspace-id': ids.workspace }
    });
    assert.equal(reloaded.statusCode, 200);
    assert.equal(
      reloaded.json<{ data: { version: number; problemQuestion: { value: string } } }>().data.problemQuestion.value,
      'Почему промышленная революция XIX века достигла такого масштаба?'
    );

    const otherWorkspace = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}`,
      headers: { cookie, 'x-workspace-id': `ws-missing-${suffix}` }
    });
    assert.ok([401, 403].includes(otherWorkspace.statusCode));

    const invocation = await pool.query<{ status: string; proposal_id: string | null }>(
      `SELECT status, proposal_id FROM ai_invocations
       WHERE workspace_id = $1 AND proposal_id = $2`,
      [ids.workspace, queuedProposal.id]
    );
    assert.equal(invocation.rows[0]?.status, 'SUCCEEDED');
    assert.equal(invocation.rows[0]?.proposal_id, queuedProposal.id);
  } finally {
    await app.close();
    await pool.end();
  }
});
