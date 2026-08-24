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
  PostgresLessonContentContextRepository,
  PostgresLessonContentSelectionRepository,
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

maybeTest('teacher selects approved UMK content explicitly while RP core stays mandatory', async () => {
  if (!databaseUrl) return;
  await migrateDatabase({ databaseUrl });

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const id = (name: string) => `${name}_selection_${suffix}`;
  const ids = {
    user: id('user'),
    workspace: id('workspace'),
    curriculumSource: id('source_curriculum'),
    umkSource: id('source_umk'),
    curriculumPack: id('curriculum_pack'),
    curriculumCourse: id('curriculum_course'),
    curriculumSection: id('curriculum_section'),
    curriculumLesson: id('curriculum_lesson'),
    requirement: id('requirement'),
    allocation: id('allocation'),
    contentPack: id('content_pack'),
    contentPackSource: id('content_pack_source'),
    sourceUnit: id('source_unit'),
    mapping: id('mapping'),
    course: id('course'),
    section: id('section'),
    lesson: id('lesson')
  } as const;
  const subject = `История Selection ${suffix}`;
  const email = `selection-${suffix}@example.test`;
  const password = `Selection-${suffix}-password-strong`;
  const authKey = 'content-selection-auth-key-at-least-32-characters-long';
  const sourceText = 'Тестовый разрешённый фрагмент об индустриализации и монополиях.';

  const pool = createPostgresPool({
    ...databaseConfigFromEnv({ DATABASE_URL: databaseUrl }),
    applicationName: 'tehkarta-content-selection-test',
    maxConnections: 4
  });
  const passwordHasher = new Argon2idPasswordHasher();
  const passwordHash = await passwordHasher.hash(password);

  const seed = await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query(
      `INSERT INTO users(id,email,normalized_email,display_name)
       VALUES ($1,$2,$2,'Content Selection Teacher')`,
      [ids.user, email]
    );
    await seed.query(
      `INSERT INTO password_credentials(user_id,password_hash,algorithm,password_updated_at)
       VALUES ($1,$2,'argon2id',now())`,
      [ids.user, passwordHash]
    );
    await seed.query(
      `INSERT INTO workspaces(id,slug,name,created_by)
       VALUES ($1,$2,'Selection workspace',$3)`,
      [ids.workspace, `selection-${suffix}`, ids.user]
    );
    await seed.query(
      `INSERT INTO workspace_memberships(workspace_id,user_id,role,permissions)
       VALUES ($1,$2,'OWNER','["course:read","lesson:read","lesson:write"]'::jsonb)`,
      [ids.workspace, ids.user]
    );
    await seed.query(
      `INSERT INTO source_documents(
         id,source_kind,title,version,mime_type,checksum_sha256,rights_basis,processing_status,access_level
       ) VALUES
       ($1,'CURRICULUM','Selection RP fixture','1','application/json',$3,'TEST_FIXTURE','READY','FULL'),
       ($2,'TEXTBOOK','Selection UMK fixture','1','application/json',$4,'TEST_FIXTURE','READY','FULL')`,
      [ids.curriculumSource, ids.umkSource, `rp-${suffix}`, `umk-${suffix}`]
    );
    await seed.query(
      `INSERT INTO curriculum_packs(
         id,subject,grade_min,grade_max,academic_year,version,status,title,source_document_id
       ) VALUES ($1,$2,9,9,'2026/27','1','PUBLISHED','Selection RP pack',$3)`,
      [ids.curriculumPack, subject, ids.curriculumSource]
    );
    await seed.query(
      `INSERT INTO curriculum_courses(
         id,curriculum_pack_id,subject,grade,title,ordinal,planned_hours
       ) VALUES ($1,$2,$3,9,'Всеобщая история',1,23)`,
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
      `INSERT INTO curriculum_requirements(
         id,curriculum_pack_id,code,kind,text_content,metadata
       ) VALUES ($1,$2,'RP-LOCKED-01','CONTENT',$3,'{}'::jsonb)`,
      [ids.requirement, ids.curriculumPack, 'Индустриализация и её ключевые понятия должны быть раскрыты.']
    );
    await seed.query(
      `INSERT INTO curriculum_requirement_allocations(
         id,requirement_id,curriculum_lesson_id,allocation_stage
       ) VALUES ($1,$2,$3,'MANDATORY')`,
      [ids.allocation, ids.requirement, ids.curriculumLesson]
    );
    await seed.query(
      `INSERT INTO content_packs(
         id,subject,grade,academic_year,version,status,title,curriculum_pack_id
       ) VALUES ($1,$2,9,'2026/27','1','PUBLISHED','Selection UMK pack',$3)`,
      [ids.contentPack, subject, ids.curriculumPack]
    );
    await seed.query(
      `INSERT INTO content_pack_sources(
         id,content_pack_id,source_document_id,resource_type,ordinal,required
       ) VALUES ($1,$2,$3,'TEXTBOOK',1,true)`,
      [ids.contentPackSource, ids.contentPack, ids.umkSource]
    );
    await seed.query(
      `INSERT INTO source_units(
         id,source_document_id,unit_type,ordinal,title,text_content,content_hash
       ) VALUES ($1,$2,'CONCEPT',1,'Монополия',$3,$4)`,
      [ids.sourceUnit, ids.umkSource, sourceText, `unit-hash-${suffix}`]
    );
    await seed.query(
      `INSERT INTO content_mappings(
         id,content_pack_id,curriculum_lesson_id,source_unit_id,relation_type,confidence,review_status
       ) VALUES ($1,$2,$3,$4,'PRIMARY',1.0,'APPROVED')`,
      [ids.mapping, ids.contentPack, ids.curriculumLesson, ids.sourceUnit]
    );
    await seed.query(
      `INSERT INTO courses(
         id,workspace_id,owner_user_id,curriculum_course_id,curriculum_pack_id,
         curriculum_pack_version,content_pack_id,content_pack_version,subject,grade,
         academic_year,title,created_by
       ) VALUES ($1,$2,$3,$4,$5,'1',$6,'1',$7,9,'2026/27','Всеобщая история',$3)`,
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
         duration_minutes,content_freedom,created_by
       ) VALUES ($1,$2,$3,$4,$5,1,'Экономика делает решающий рывок',45,'TEXTBOOK_PLUS',$6)`,
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
    generate: (prefix = 'id') => `${prefix}_selection_${randomUUID()}`
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
    dummyPasswordHash: await passwordHasher.hash(`dummy-selection-${suffix}`)
  });
  const contentContext = new PostgresLessonContentContextRepository(pool);
  const contentSelections = new PostgresLessonContentSelectionRepository(pool);
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
    lessons: new PostgresLessonRepository(pool),
    invalidations: new PostgresLessonInvalidationRepository(pool),
    proposals: new PostgresLessonAiProposalRepository(pool),
    proposalApplication: new PostgresLessonAiProposalApplicationRepository(pool),
    methodologyFeedback: new PostgresMethodologyFeedbackRepository(pool),
    contentContext,
    contentSelections,
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
    const readHeaders = { cookie, 'x-workspace-id': ids.workspace };
    const writeHeaders = { ...readHeaders, 'x-csrf-token': loginBody.csrfToken };

    const initial = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/content-context`,
      headers: readHeaders
    });
    assert.equal(initial.statusCode, 200, initial.body);
    const initialContext = initial.json<{
      data: {
        curriculumRequirements: Array<{ id: string }>;
        umkEvidence: Array<{ mappingId: string; selection: { state: string } }>;
        approvedContentSet: {
          mandatoryRequirementIds: string[];
          includedUmkMappingIds: string[];
          undecidedUmkMappingIds: string[];
        };
      };
    }>().data;
    assert.deepEqual(initialContext.approvedContentSet.mandatoryRequirementIds, [ids.requirement]);
    assert.equal(initialContext.umkEvidence[0]?.selection.state, 'UNDECIDED');
    assert.deepEqual(initialContext.approvedContentSet.includedUmkMappingIds, []);
    assert.deepEqual(initialContext.approvedContentSet.undecidedUmkMappingIds, [ids.mapping]);

    const noCsrf = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.mapping}`,
      headers: readHeaders,
      payload: { decision: 'INCLUDED', expectedLessonVersion: 1 }
    });
    assert.equal(noCsrf.statusCode, 403);

    const included = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.mapping}`,
      headers: writeHeaders,
      payload: { decision: 'INCLUDED', expectedLessonVersion: 1 }
    });
    assert.equal(included.statusCode, 200, included.body);
    const includedBody = included.json<{
      data: { version: number };
      changed: boolean;
      contentContext: {
        umkEvidence: Array<{ mappingId: string; selection: { state: string; revision: number } }>;
        approvedContentSet: { mandatoryRequirementIds: string[]; includedUmkMappingIds: string[] };
      };
      invalidations: Array<{ affectedSemanticKey: string; status: string }>;
    }>();
    assert.equal(includedBody.data.version, 2);
    assert.equal(includedBody.changed, true);
    assert.equal(includedBody.contentContext.umkEvidence[0]?.selection.state, 'INCLUDED');
    assert.equal(includedBody.contentContext.umkEvidence[0]?.selection.revision, 1);
    assert.deepEqual(includedBody.contentContext.approvedContentSet.includedUmkMappingIds, [ids.mapping]);
    assert.deepEqual(includedBody.contentContext.approvedContentSet.mandatoryRequirementIds, [ids.requirement]);
    for (const key of ['stage', 'material', 'assessment', 'homework', 'finalConclusion']) {
      assert.ok(
        includedBody.invalidations.some(
          (item) => item.status === 'STALE' && item.affectedSemanticKey === key
        ),
        `${key} must become stale after the approved content set changes.`
      );
    }

    const stored = await pool.query<{
      decision: string;
      revision: number;
      title_snapshot: string;
      record_json: string;
    }>(
      `SELECT decision, revision, title_snapshot, to_jsonb(lesson_content_selections)::text AS record_json
       FROM lesson_content_selections
       WHERE workspace_id = $1 AND lesson_id = $2 AND source_ref_id = $3`,
      [ids.workspace, ids.lesson, ids.mapping]
    );
    assert.equal(stored.rows[0]?.decision, 'INCLUDED');
    assert.equal(stored.rows[0]?.revision, 1);
    assert.equal(stored.rows[0]?.title_snapshot, 'Монополия');
    assert.ok(!stored.rows[0]?.record_json.includes(sourceText), 'Selection audit row must not duplicate licensed source text.');

    const idempotent = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.mapping}`,
      headers: writeHeaders,
      payload: { decision: 'INCLUDED', expectedLessonVersion: 2 }
    });
    assert.equal(idempotent.statusCode, 200, idempotent.body);
    const idempotentBody = idempotent.json<{ data: { version: number }; changed: boolean }>();
    assert.equal(idempotentBody.data.version, 2);
    assert.equal(idempotentBody.changed, false);

    const excluded = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.mapping}`,
      headers: writeHeaders,
      payload: { decision: 'EXCLUDED', expectedLessonVersion: 2 }
    });
    assert.equal(excluded.statusCode, 200, excluded.body);
    const excludedBody = excluded.json<{
      data: { version: number };
      contentContext: {
        umkEvidence: Array<{ selection: { state: string; revision: number } }>;
        approvedContentSet: { excludedUmkMappingIds: string[]; mandatoryRequirementIds: string[] };
      };
    }>();
    assert.equal(excludedBody.data.version, 3);
    assert.equal(excludedBody.contentContext.umkEvidence[0]?.selection.state, 'EXCLUDED');
    assert.equal(excludedBody.contentContext.umkEvidence[0]?.selection.revision, 2);
    assert.deepEqual(excludedBody.contentContext.approvedContentSet.excludedUmkMappingIds, [ids.mapping]);
    assert.deepEqual(excludedBody.contentContext.approvedContentSet.mandatoryRequirementIds, [ids.requirement]);

    const stale = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.mapping}`,
      headers: writeHeaders,
      payload: { decision: 'INCLUDED', expectedLessonVersion: 2 }
    });
    assert.equal(stale.statusCode, 409, stale.body);

    const rpCannotBeSelectedThroughUmkRoute = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${ids.lesson}/content-selection/umk/${ids.requirement}`,
      headers: writeHeaders,
      payload: { decision: 'EXCLUDED', expectedLessonVersion: 3 }
    });
    assert.equal(rpCannotBeSelectedThroughUmkRoute.statusCode, 404);

    const finalContext = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/content-context`,
      headers: readHeaders
    });
    assert.equal(finalContext.statusCode, 200, finalContext.body);
    assert.deepEqual(
      finalContext.json<{ data: { approvedContentSet: { mandatoryRequirementIds: string[] } } }>()
        .data.approvedContentSet.mandatoryRequirementIds,
      [ids.requirement],
      'RP requirements remain mandatory regardless of UMK include/exclude decisions.'
    );
  } finally {
    await app.close();
    await pool.end();
  }
});
