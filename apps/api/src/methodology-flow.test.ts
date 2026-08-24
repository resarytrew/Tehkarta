import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  migrateDatabase,
  PostgresCourseRepository,
  PostgresIdentityRepository,
  PostgresLessonAiProposalApplicationRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonInvalidationRepository,
  PostgresLessonRepository,
  PostgresLoginThrottleRepository,
  PostgresMethodologyFeedbackRepository,
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

type FixtureIdKey =
  | 'user'
  | 'workspace'
  | 'source'
  | 'curriculumPack'
  | 'curriculumCourse'
  | 'curriculumSection'
  | 'curriculumLesson'
  | 'contentPack'
  | 'course'
  | 'section'
  | 'lesson';

maybeTest('Methodical Constructor uses only approved outcomes and applies teacher-authoritative choices', async () => {
  if (!databaseUrl) return;
  await migrateDatabase({ databaseUrl });

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const subject = `История Methodology ${suffix}`;
  const idKeys: FixtureIdKey[] = [
    'user',
    'workspace',
    'source',
    'curriculumPack',
    'curriculumCourse',
    'curriculumSection',
    'curriculumLesson',
    'contentPack',
    'course',
    'section',
    'lesson'
  ];
  const ids = Object.fromEntries(
    idKeys.map((key) => [key, `${key}_methodology_${suffix}`])
  ) as Record<FixtureIdKey, string>;
  const email = `methodology-${suffix}@example.test`;
  const password = `Methodology-${suffix}-password-strong`;
  const authKey = 'methodology-auth-ip-hash-key-at-least-32-characters';
  const pool = createPostgresPool({
    ...databaseConfigFromEnv({ DATABASE_URL: databaseUrl }),
    applicationName: 'tehkarta-methodology-test',
    maxConnections: 4
  });
  const passwordHasher = new Argon2idPasswordHasher();
  const passwordHash = await passwordHasher.hash(password);

  const seed = await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query(
      `INSERT INTO users(id,email,normalized_email,display_name)
       VALUES ($1,$2,$2,'Methodology Teacher')`,
      [ids.user, email]
    );
    await seed.query(
      `INSERT INTO password_credentials(user_id,password_hash,algorithm,password_updated_at)
       VALUES ($1,$2,'argon2id',now())`,
      [ids.user, passwordHash]
    );
    await seed.query(
      `INSERT INTO workspaces(id,slug,name,created_by)
       VALUES ($1,$2,'Methodology workspace',$3)`,
      [ids.workspace, `methodology-${suffix}`, ids.user]
    );
    await seed.query(
      `INSERT INTO workspace_memberships(workspace_id,user_id,role,permissions)
       VALUES ($1,$2,'OWNER','["course:read","course:write","lesson:read","lesson:write"]'::jsonb)`,
      [ids.workspace, ids.user]
    );
    await seed.query(
      `INSERT INTO source_documents(
         id,source_kind,title,version,mime_type,checksum_sha256,rights_basis,processing_status
       ) VALUES ($1,'CURRICULUM','Methodology curriculum','1','application/json',$2,'TEST_FIXTURE','READY')`,
      [ids.source, `methodology-checksum-${suffix}`]
    );
    await seed.query(
      `INSERT INTO curriculum_packs(
         id,subject,grade_min,grade_max,academic_year,version,status,title,source_document_id
       ) VALUES ($1,$2,9,9,'2026/27','1','PUBLISHED','Methodology curriculum pack',$3)`,
      [ids.curriculumPack, subject, ids.source]
    );
    await seed.query(
      `INSERT INTO curriculum_courses(
         id,curriculum_pack_id,subject,grade,title,ordinal,planned_hours
       ) VALUES ($1,$2,$3,9,'Всеобщая история. История Нового времени. XIX — начало XX в.',1,23)`,
      [ids.curriculumCourse, ids.curriculumPack, subject]
    );
    await seed.query(
      `INSERT INTO curriculum_sections(id,curriculum_course_id,title,ordinal,planned_hours)
       VALUES ($1,$2,'Начало индустриальной эпохи',1,7)`,
      [ids.curriculumSection, ids.curriculumCourse]
    );
    await seed.query(
      `INSERT INTO curriculum_lessons(
         id,curriculum_section_id,title,ordinal,planned_hours,duration_minutes
       ) VALUES ($1,$2,'Экономика делает решающий рывок',1,1,45)`,
      [ids.curriculumLesson, ids.curriculumSection]
    );
    await seed.query(
      `INSERT INTO content_packs(
         id,subject,grade,academic_year,version,status,title,curriculum_pack_id
       ) VALUES ($1,$2,9,'2026/27','1','PUBLISHED','Methodology UMK fixture',$3)`,
      [ids.contentPack, subject, ids.curriculumPack]
    );
    await seed.query(
      `INSERT INTO courses(
         id,workspace_id,owner_user_id,curriculum_course_id,curriculum_pack_id,
         curriculum_pack_version,content_pack_id,content_pack_version,subject,grade,
         academic_year,title,created_by
       ) VALUES (
         $1,$2,$3,$4,$5,'1',$6,'1',$7,9,'2026/27',
         'Всеобщая история. История Нового времени. XIX — начало XX в.',$3
       )`,
      [
        ids.course,
        ids.workspace,
        ids.user,
        ids.curriculumCourse,
        ids.curriculumPack,
        ids.contentPack,
        subject
      ]
    );
    await seed.query(
      `INSERT INTO course_sections(
         id,workspace_id,course_id,curriculum_section_id,position,title,planned_hours
       ) VALUES ($1,$2,$3,$4,1,'Начало индустриальной эпохи',7)`,
      [ids.section, ids.workspace, ids.course, ids.curriculumSection]
    );
    await seed.query(
      `INSERT INTO lessons(
         id,workspace_id,course_id,section_id,curriculum_lesson_id,position,title,
         duration_minutes,created_by
       ) VALUES ($1,$2,$3,$4,$5,1,'Экономика делает решающий рывок',45,$6)`,
      [ids.lesson, ids.workspace, ids.course, ids.section, ids.curriculumLesson, ids.user]
    );
    await seed.query('COMMIT');
  } catch (error) {
    await seed.query('ROLLBACK');
    throw error;
  } finally {
    seed.release();
  }

  const clock: Clock = { now: () => new Date() };
  const idGenerator: IdGenerator = {
    generate: (prefix = 'id') => `${prefix}_methodology_${randomUUID()}`
  };
  const identities = new PostgresIdentityRepository(pool);
  const sessions = new SessionService({
    identities,
    sessions: new PostgresSessionRepository(pool),
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
    dummyPasswordHash: await passwordHasher.hash(`dummy-methodology-${suffix}`)
  });
  const lessons = new PostgresLessonRepository(pool);
  const methodologyFeedback = new PostgresMethodologyFeedbackRepository(pool);
  const config: ApiConfig = {
    host: '127.0.0.1',
    port: 8080,
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
    courses: new PostgresCourseRepository(pool),
    lessons,
    invalidations: new PostgresLessonInvalidationRepository(pool),
    proposals: new PostgresLessonAiProposalRepository(pool),
    proposalApplication: new PostgresLessonAiProposalApplicationRepository(pool),
    methodologyFeedback,
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
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0];
    assert.ok(cookie);
    assert.equal(loginBody.memberships[0]?.workspaceId, ids.workspace);
    const readHeaders = { cookie, 'x-workspace-id': ids.workspace };
    const writeHeaders = { ...readHeaders, 'x-csrf-token': loginBody.csrfToken };

    const empty = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/methodology/recommendations`,
      headers: readHeaders
    });
    assert.equal(empty.statusCode, 200, empty.body);
    assert.equal(
      empty.json<{ data: { recommendations: unknown[] } }>().data.recommendations.length,
      0,
      'No recommendation may be derived before an outcome is APPROVED.'
    );

    const noCsrf = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/outcomes`,
      headers: readHeaders,
      payload: {
        value: 'Объяснять причины успехов промышленной революции XIX века.',
        expectedLessonVersion: 1
      }
    });
    assert.equal(noCsrf.statusCode, 403);

    const outcome = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/outcomes`,
      headers: writeHeaders,
      payload: {
        value: 'Объяснять причины успехов промышленной революции XIX века, опираясь на факты и причинно-следственные связи.',
        expectedLessonVersion: 1
      }
    });
    assert.equal(outcome.statusCode, 200, outcome.body);
    const outcomeLesson = outcome.json<{
      data: {
        version: number;
        outcomes: Array<{ value: string; meta: { source: string; status: string } }>;
      };
    }>().data;
    assert.equal(outcomeLesson.version, 2);
    assert.equal(outcomeLesson.outcomes[0]?.meta.source, 'TEACHER');
    assert.equal(outcomeLesson.outcomes[0]?.meta.status, 'APPROVED');

    const recommended = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/methodology/recommendations`,
      headers: readHeaders
    });
    assert.equal(recommended.statusCode, 200, recommended.body);
    const bundle = recommended.json<{
      data: {
        pack: { id: string; version: string };
        recommendations: Array<{
          id: string;
          method: { id: string; name: string };
          targetOutcome: { value: string };
          suggestedTechniques: Array<{ id: string }>;
          compatibleForms: Array<{ id: string }>;
        }>;
      };
    }>().data;
    assert.ok(bundle.recommendations.length > 0);
    const first = bundle.recommendations[0]!;
    assert.equal(first.method.id, 'hypothesis-testing');
    assert.match(first.targetOutcome.value, /причин/i);
    assert.ok(first.compatibleForms[0]?.id);

    const use = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/methodology/recommendations/${encodeURIComponent(first.id)}/use`,
      headers: writeHeaders,
      payload: {
        expectedLessonVersion: 2,
        formId: first.compatibleForms[0]!.id,
        techniqueIds: first.suggestedTechniques.slice(0, 2).map((item) => item.id)
      }
    });
    assert.equal(use.statusCode, 200, use.body);
    const usedLesson = use.json<{
      data: {
        version: number;
        selectedMethods: Array<{ value: string; meta: { source: string; status: string } }>;
        selectedTechniques: Array<{ meta: { source: string; status: string } }>;
        selectedForms: Array<{ meta: { source: string; status: string } }>;
      };
      invalidations: Array<{ affectedSemanticKey: string; status: string }>;
    }>();
    assert.equal(usedLesson.data.version, 3);
    assert.equal(usedLesson.data.selectedMethods[0]?.value, first.method.name);
    assert.equal(usedLesson.data.selectedMethods[0]?.meta.source, 'TEACHER');
    assert.equal(usedLesson.data.selectedMethods[0]?.meta.status, 'APPROVED');
    assert.ok(
      usedLesson.data.selectedTechniques.every(
        (field) => field.meta.source === 'TEACHER' && field.meta.status === 'APPROVED'
      )
    );
    assert.ok(
      usedLesson.data.selectedForms.every(
        (field) => field.meta.source === 'TEACHER' && field.meta.status === 'APPROVED'
      )
    );
    assert.ok(
      usedLesson.invalidations.some(
        (item) => item.status === 'STALE' && item.affectedSemanticKey === 'content'
      )
    );

    const rejectedCandidate = bundle.recommendations.find((item) => item.id !== first.id);
    if (rejectedCandidate) {
      const reject = await app.inject({
        method: 'POST',
        url: `/api/v1/lessons/${ids.lesson}/methodology/recommendations/${encodeURIComponent(rejectedCandidate.id)}/reject`,
        headers: writeHeaders
      });
      assert.equal(reject.statusCode, 200, reject.body);

      const afterReject = await app.inject({
        method: 'GET',
        url: `/api/v1/lessons/${ids.lesson}/methodology/recommendations`,
        headers: readHeaders
      });
      const remaining = afterReject.json<{
        data: { recommendations: Array<{ id: string }> };
      }>().data.recommendations;
      assert.ok(!remaining.some((item) => item.id === rejectedCandidate.id));

      const feedback = await pool.query<{ actor_user_id: string; status: string }>(
        `SELECT actor_user_id, status
         FROM lesson_methodology_feedback
         WHERE workspace_id = $1 AND lesson_id = $2 AND recommendation_id = $3`,
        [ids.workspace, ids.lesson, rejectedCandidate.id]
      );
      assert.equal(feedback.rows[0]?.actor_user_id, ids.user);
      assert.equal(feedback.rows[0]?.status, 'REJECTED');
    }

    const reload = await lessons.getById(
      {
        workspaceId: ids.workspace,
        actorUserId: ids.user,
        requestId: `methodology-reload-${suffix}`
      },
      ids.lesson
    );
    assert.equal(reload?.selectedMethods[0]?.meta.status, 'APPROVED');
    assert.equal(reload?.selectedMethods[0]?.meta.source, 'TEACHER');
  } finally {
    await app.close();
    await pool.end();
  }
});
