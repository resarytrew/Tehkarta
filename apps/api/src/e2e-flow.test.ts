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
  const subject = `История E2E ${suffix}`;
  const ids = Object.fromEntries(
    ['user','workspace','source','curriculumPack','curriculumCourse','curriculumSection','curriculumLesson','contentPack','course','section','lesson']
      .map((key) => [key, `${key}_e2e_${suffix}`])
  ) as Record<string, string>;
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

  const seed = await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query(`INSERT INTO users(id,email,normalized_email,display_name) VALUES ($1,$2,$2,'E2E Teacher')`, [ids.user, email]);
    await seed.query(`INSERT INTO password_credentials(user_id,password_hash,algorithm,password_updated_at) VALUES ($1,$2,'argon2id',now())`, [ids.user, passwordHash]);
    await seed.query(`INSERT INTO workspaces(id,slug,name,created_by) VALUES ($1,$2,'E2E workspace',$3)`, [ids.workspace, `e2e-${suffix}`, ids.user]);
    await seed.query(`INSERT INTO workspace_memberships(workspace_id,user_id,role,permissions) VALUES ($1,$2,'OWNER','["course:read","course:write","lesson:read","lesson:write"]'::jsonb)`, [ids.workspace, ids.user]);
    await seed.query(`INSERT INTO source_documents(id,source_kind,title,version,mime_type,checksum_sha256,rights_basis,processing_status) VALUES ($1,'CURRICULUM','E2E curriculum','1','application/json',$2,'TEST_FIXTURE','READY')`, [ids.source, `e2e-checksum-${suffix}`]);
    await seed.query(`INSERT INTO curriculum_packs(id,subject,grade_min,grade_max,academic_year,version,status,title,source_document_id) VALUES ($1,$2,9,9,'2026/27','1','PUBLISHED','E2E curriculum pack',$3)`, [ids.curriculumPack, subject, ids.source]);
    await seed.query(`INSERT INTO curriculum_courses(id,curriculum_pack_id,subject,grade,title,ordinal,planned_hours) VALUES ($1,$2,$3,9,'Всеобщая история. История Нового времени. XIX — начало XX в.',1,23)`, [ids.curriculumCourse, ids.curriculumPack, subject]);
    await seed.query(`INSERT INTO curriculum_sections(id,curriculum_course_id,title,ordinal,planned_hours) VALUES ($1,$2,'Начало индустриальной эпохи',1,7)`, [ids.curriculumSection, ids.curriculumCourse]);
    await seed.query(`INSERT INTO curriculum_lessons(id,curriculum_section_id,title,ordinal,planned_hours,duration_minutes) VALUES ($1,$2,'Экономика делает решающий рывок',1,1,45)`, [ids.curriculumLesson, ids.curriculumSection]);
    await seed.query(`INSERT INTO content_packs(id,subject,grade,academic_year,version,status,title,curriculum_pack_id) VALUES ($1,$2,9,'2026/27','1','PUBLISHED','E2E UMK fixture',$3)`, [ids.contentPack, subject, ids.curriculumPack]);
    await seed.query(`INSERT INTO courses(id,workspace_id,owner_user_id,curriculum_course_id,curriculum_pack_id,curriculum_pack_version,content_pack_id,content_pack_version,subject,grade,academic_year,title,created_by) VALUES ($1,$2,$3,$4,$5,'1',$6,'1',$7,9,'2026/27','Всеобщая история. История Нового времени. XIX — начало XX в.',$3)`, [ids.course, ids.workspace, ids.user, ids.curriculumCourse, ids.curriculumPack, ids.contentPack, subject]);
    await seed.query(`INSERT INTO course_sections(id,workspace_id,course_id,curriculum_section_id,position,title,planned_hours) VALUES ($1,$2,$3,$4,1,'Начало индустриальной эпохи',7)`, [ids.section, ids.workspace, ids.course, ids.curriculumSection]);
    await seed.query(`INSERT INTO lessons(id,workspace_id,course_id,section_id,curriculum_lesson_id,position,title,duration_minutes,created_by) VALUES ($1,$2,$3,$4,$5,1,'Экономика делает решающий рывок',45,$6)`, [ids.lesson, ids.workspace, ids.course, ids.section, ids.curriculumLesson, ids.user]);
    await seed.query('COMMIT');
  } catch (error) {
    await seed.query('ROLLBACK');
    throw error;
  } finally {
    seed.release();
  }

  const clock: Clock = { now: () => new Date() };
  const idGenerator: IdGenerator = { generate: (prefix = 'id') => `${prefix}_e2e_${randomUUID()}` };
  const identities = new PostgresIdentityRepository(pool);
  const sessions = new SessionService({ identities, sessions: new PostgresSessionRepository(pool), tokens: new NodeSessionTokenCodec(), clock, ids: idGenerator });
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
  const config: ApiConfig = { host:'127.0.0.1', port:8080, environment:'test', allowedOrigins:['http://localhost:5173'], sessionCookieName:'tehkarta_session', secureCookies:false, sessionTtlSeconds:3600, authIpHashKey:authKey, trustProxy:false };
  const app = await createApiApp(config, { sessions, passwordLogin, courses, lessons, invalidations, proposals, proposalApplication, authorization:new WorkspaceAuthorizationPolicy(), clock, ids:idGenerator });

  try {
    const login = await app.inject({ method:'POST', url:'/api/v1/auth/login', payload:{ email, password } });
    assert.equal(login.statusCode, 200, login.body);
    const loginBody = login.json<{csrfToken:string;memberships:Array<{workspaceId:string}>}>();
    assert.equal(loginBody.memberships[0]?.workspaceId, ids.workspace);
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0];
    assert.ok(cookie);
    const headers = { cookie, 'x-workspace-id':ids.workspace, 'x-csrf-token':loginBody.csrfToken };

    const edit = await app.inject({ method:'PATCH', url:`/api/v1/lessons/${ids.lesson}/decisions/problemQuestion`, headers, payload:{ value:'Почему в XIX в. промышленная революция достигла огромных успехов?', expectedLessonVersion:1 } });
    assert.equal(edit.statusCode, 200, edit.body);
    const edited = edit.json<{data:{version:number;problemQuestion:{meta:{revision:number;status:string}}}}>().data;
    assert.equal(edited.problemQuestion.meta.status, 'EDITED');

    const approve = await app.inject({ method:'POST', url:`/api/v1/lessons/${ids.lesson}/decisions/problemQuestion/approve`, headers, payload:{ expectedLessonVersion:2, expectedFieldRevision:edited.problemQuestion.meta.revision } });
    assert.equal(approve.statusCode, 200, approve.body);
    const approved = approve.json<{data:{version:number;problemQuestion:{value:string;meta:{status:string}}}}>().data;
    assert.equal(approved.version, 3);
    assert.equal(approved.problemQuestion.meta.status, 'APPROVED');

    const noCsrf = await app.inject({ method:'POST', url:`/api/v1/lessons/${ids.lesson}/ai-proposals`, headers:{cookie,'x-workspace-id':ids.workspace}, payload:{semanticKey:'problemQuestion',action:'IMPROVE',expectedLessonVersion:3,candidateCount:1,requestKey:`no-csrf-${suffix}`} });
    assert.equal(noCsrf.statusCode, 403);

    const requestKey = `proposal-${suffix}`;
    const proposalPayload = { semanticKey:'problemQuestion', action:'IMPROVE', expectedLessonVersion:3, candidateCount:1, teacherInstruction:'Сохрани причинно-следственный характер вопроса.', requestKey };
    const queued = await app.inject({ method:'POST', url:`/api/v1/lessons/${ids.lesson}/ai-proposals`, headers, payload:proposalPayload });
    assert.equal(queued.statusCode, 202, queued.body);
    const queuedProposal = queued.json<{data:{id:string;status:string}}>().data;
    assert.equal(queuedProposal.status, 'QUEUED');
    const replay = await app.inject({ method:'POST', url:`/api/v1/lessons/${ids.lesson}/ai-proposals`, headers, payload:proposalPayload });
    assert.equal(replay.json<{data:{id:string}}>().data.id, queuedProposal.id);

    const generator: LessonDecisionProposalGenerator = { async generate(input) {
      assert.equal(input.context.approvedProblemQuestion, 'Почему в XIX в. промышленная революция достигла огромных успехов?');
      return { candidates:[{id:'candidate-1',value:'Почему промышленная революция XIX века достигла такого масштаба?',rationale:'Сохраняет причинный поиск и делает формулировку компактнее.'}], taskType:'REFORMULATE', provider:'e2e-provider', model:'e2e-model', promptVersion:'e2e-prompt-v1', routingPolicyVersion:'e2e-routing-v1', inputHash:'e2e-input-hash', latencyMs:10 };
    }};
    const processor = new ProcessLessonDecisionProposal({ lessons, courses, proposals, generator, invocations:new PostgresAiInvocationRepository(pool), clock });
    const processed = await new RunNextLessonDecisionProposalJob({ jobs:new PostgresAsyncJobProcessingRepository(pool), proposals, processor, clock }).execute(`worker-e2e-${suffix}`);
    assert.equal(processed.status, 'PROCESSED');

    const detail = await app.inject({ method:'GET', url:`/api/v1/lessons/${ids.lesson}/ai-proposals/${queuedProposal.id}`, headers:{cookie,'x-workspace-id':ids.workspace} });
    assert.equal(detail.json<{data:{status:string}}>().data.status, 'READY');
    const beforeApply = await app.inject({ method:'GET', url:`/api/v1/lessons/${ids.lesson}`, headers:{cookie,'x-workspace-id':ids.workspace} });
    assert.equal(beforeApply.json<{data:{problemQuestion:{value:string}}}>().data.problemQuestion.value, 'Почему в XIX в. промышленная революция достигла огромных успехов?');

    const applied = await app.inject({ method:'POST', url:`/api/v1/lessons/${ids.lesson}/ai-proposals/${queuedProposal.id}/apply`, headers, payload:{candidateId:'candidate-1',expectedLessonVersion:3} });
    assert.equal(applied.statusCode, 200, applied.body);
    const appliedData = applied.json<{data:{version:number;problemQuestion:{value:string;meta:{source:string;status:string}}};proposal:{status:string}}>();
    assert.equal(appliedData.data.version, 4);
    assert.equal(appliedData.data.problemQuestion.meta.source, 'TEACHER');
    assert.equal(appliedData.data.problemQuestion.meta.status, 'APPROVED');
    assert.equal(appliedData.proposal.status, 'APPLIED');

    const reload = await app.inject({ method:'GET', url:`/api/v1/lessons/${ids.lesson}`, headers:{cookie,'x-workspace-id':ids.workspace} });
    assert.equal(reload.json<{data:{problemQuestion:{value:string}}}>().data.problemQuestion.value, 'Почему промышленная революция XIX века достигла такого масштаба?');
    const forbidden = await app.inject({ method:'GET', url:`/api/v1/lessons/${ids.lesson}`, headers:{cookie,'x-workspace-id':`missing-${suffix}`} });
    assert.equal(forbidden.statusCode, 403);
    const invocation = await pool.query<{status:string;proposal_id:string|null}>(`SELECT status,proposal_id FROM ai_invocations WHERE workspace_id=$1 AND proposal_id=$2`, [ids.workspace, queuedProposal.id]);
    assert.equal(invocation.rows[0]?.status, 'SUCCEEDED');
  } finally {
    await app.close();
    await pool.end();
  }
});
