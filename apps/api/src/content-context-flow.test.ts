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

maybeTest('lesson content context exposes approved RP/UMK evidence and fails closed on source text rights', async () => {
  if (!databaseUrl) return;
  await migrateDatabase({ databaseUrl });

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const id = (name: string) => `${name}_content_${suffix}`;
  const ids = {
    user: id('user'),
    workspace: id('workspace'),
    curriculumSource: id('source_curriculum'),
    fullSource: id('source_full'),
    restrictedSource: id('source_restricted'),
    curriculumPack: id('curriculum_pack'),
    curriculumCourse: id('curriculum_course'),
    curriculumSection: id('curriculum_section'),
    curriculumLesson: id('curriculum_lesson'),
    contentPack: id('content_pack'),
    course: id('course'),
    section: id('section'),
    lesson: id('lesson')
  } as const;
  const subject = `История Content ${suffix}`;
  const email = `content-${suffix}@example.test`;
  const password = `Content-${suffix}-password-strong`;
  const authKey = 'content-context-auth-key-at-least-32-characters-long';
  const pool = createPostgresPool({
    ...databaseConfigFromEnv({ DATABASE_URL: databaseUrl }),
    applicationName: 'tehkarta-content-context-test',
    maxConnections: 4
  });
  const passwordHasher = new Argon2idPasswordHasher();
  const passwordHash = await passwordHasher.hash(password);

  const seed = await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query(
      `INSERT INTO users(id,email,normalized_email,display_name)
       VALUES ($1,$2,$2,'Content Teacher')`,
      [ids.user, email]
    );
    await seed.query(
      `INSERT INTO password_credentials(user_id,password_hash,algorithm,password_updated_at)
       VALUES ($1,$2,'argon2id',now())`,
      [ids.user, passwordHash]
    );
    await seed.query(
      `INSERT INTO workspaces(id,slug,name,created_by)
       VALUES ($1,$2,'Content workspace',$3)`,
      [ids.workspace, `content-${suffix}`, ids.user]
    );
    await seed.query(
      `INSERT INTO workspace_memberships(workspace_id,user_id,role,permissions)
       VALUES ($1,$2,'OWNER','["course:read","lesson:read"]'::jsonb)`,
      [ids.workspace, ids.user]
    );

    await seed.query(
      `INSERT INTO source_documents(
         id,source_kind,title,version,mime_type,checksum_sha256,rights_basis,processing_status,access_level
       ) VALUES
       ($1,'CURRICULUM','Content RP fixture','1','application/json',$4,'TEST_FIXTURE','READY','FULL'),
       ($2,'TEXTBOOK','Allowed UMK fixture','1','application/json',$5,'TEST_FIXTURE','READY','FULL'),
       ($3,'TEXTBOOK','Restricted UMK fixture','1','application/json',$6,'LICENSE_METADATA_ONLY','READY','METADATA_ONLY')`,
      [
        ids.curriculumSource,
        ids.fullSource,
        ids.restrictedSource,
        `rp-${suffix}`,
        `full-${suffix}`,
        `restricted-${suffix}`
      ]
    );
    await seed.query(
      `INSERT INTO curriculum_packs(
         id,subject,grade_min,grade_max,academic_year,version,status,title,source_document_id
       ) VALUES ($1,$2,9,9,'2026/27','1','PUBLISHED','Content RP pack',$3)`,
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

    const requirementId = id('requirement');
    await seed.query(
      `INSERT INTO curriculum_requirements(
         id,curriculum_pack_id,code,kind,text_content,metadata
       ) VALUES ($1,$2,'RP-CONTENT-01','CONTENT',$3,'{"fixture":true}'::jsonb)`,
      [
        requirementId,
        ids.curriculumPack,
        'Индустриализация, вторая промышленная революция и монополии.'
      ]
    );
    await seed.query(
      `INSERT INTO curriculum_requirement_allocations(
         id,requirement_id,curriculum_lesson_id,allocation_stage
       ) VALUES ($1,$2,$3,'MANDATORY')`,
      [id('allocation'), requirementId, ids.curriculumLesson]
    );

    await seed.query(
      `INSERT INTO content_packs(
         id,subject,grade,academic_year,version,status,title,curriculum_pack_id
       ) VALUES ($1,$2,9,'2026/27','1','PUBLISHED','Content UMK pack',$3)`,
      [ids.contentPack, subject, ids.curriculumPack]
    );
    await seed.query(
      `INSERT INTO content_pack_sources(
         id,content_pack_id,source_document_id,resource_type,ordinal,required
       ) VALUES
       ($1,$3,$4,'TEXTBOOK',1,true),
       ($2,$3,$5,'TEXTBOOK',2,false)`,
      [id('cps_full'), id('cps_restricted'), ids.contentPack, ids.fullSource, ids.restrictedSource]
    );

    const fullUnit = id('unit_full');
    const restrictedUnit = id('unit_restricted');
    const unreviewedUnit = id('unit_unreviewed');
    await seed.query(
      `INSERT INTO source_units(
         id,source_document_id,unit_type,ordinal,title,text_content,content_hash
       ) VALUES
       ($1,$4,'CONCEPT',1,'Вторая промышленная революция','Разрешённый тестовый текст о второй промышленной революции.',$6),
       ($2,$5,'CONCEPT',1,'Монополия','Этот сохранённый текст не должен покидать сервер при METADATA_ONLY.',$7),
       ($3,$4,'EXTENSION',2,'Непроверенное расширение','Непроверенный текст не должен попадать в авторитетный контекст.',$8)`,
      [
        fullUnit,
        restrictedUnit,
        unreviewedUnit,
        ids.fullSource,
        ids.restrictedSource,
        `full-unit-${suffix}`,
        `restricted-unit-${suffix}`,
        `unreviewed-unit-${suffix}`
      ]
    );
    await seed.query(
      `INSERT INTO content_mappings(
         id,content_pack_id,curriculum_lesson_id,source_unit_id,relation_type,confidence,review_status
       ) VALUES
       ($1,$4,$5,$6,'PRIMARY',1.0,'APPROVED'),
       ($2,$4,$5,$7,'PRIMARY',1.0,'APPROVED'),
       ($3,$4,$5,$8,'EXTENSION',0.5,'UNREVIEWED')`,
      [
        id('map_full'),
        id('map_restricted'),
        id('map_unreviewed'),
        ids.contentPack,
        ids.curriculumLesson,
        fullUnit,
        restrictedUnit,
        unreviewedUnit
      ]
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
    generate: (prefix = 'id') => `${prefix}_content_${randomUUID()}`
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
    dummyPasswordHash: await passwordHasher.hash(`dummy-content-${suffix}`)
  });
  const contentContext = new PostgresLessonContentContextRepository(pool);
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
    const loginBody = login.json<{ memberships: Array<{ workspaceId: string }> }>();
    assert.equal(loginBody.memberships[0]?.workspaceId, ids.workspace);
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0];
    assert.ok(cookie);
    const headers = { cookie, 'x-workspace-id': ids.workspace };

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/content-context`,
      headers
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json<{
      data: {
        contentMode: string;
        curriculumPack: { id: string; version: string };
        contentPack: { id: string; version: string };
        curriculumRequirements: Array<{
          code?: string;
          text: string;
          allocationScope: string;
          source: { sourceId: string; accessLevel: string } | null;
        }>;
        umkEvidence: Array<{
          title: string;
          text?: string;
          textRestricted: boolean;
          source: { sourceId: string; rightsBasis: string; accessLevel: string };
        }>;
        aiSupplemental: unknown[];
      };
    }>().data;

    assert.equal(body.contentMode, 'TEXTBOOK_PLUS');
    assert.equal(body.curriculumPack.id, ids.curriculumPack);
    assert.equal(body.contentPack.id, ids.contentPack);
    assert.equal(body.curriculumRequirements.length, 1);
    assert.equal(body.curriculumRequirements[0]?.code, 'RP-CONTENT-01');
    assert.equal(body.curriculumRequirements[0]?.allocationScope, 'LESSON');
    assert.equal(body.curriculumRequirements[0]?.source?.sourceId, ids.curriculumSource);

    assert.equal(body.umkEvidence.length, 2, 'UNREVIEWED mappings must not enter authoritative UMK evidence.');
    const allowed = body.umkEvidence.find((item) => item.source.sourceId === ids.fullSource);
    assert.equal(allowed?.text, 'Разрешённый тестовый текст о второй промышленной революции.');
    assert.equal(allowed?.textRestricted, false);
    assert.equal(allowed?.source.accessLevel, 'FULL');

    const restricted = body.umkEvidence.find((item) => item.source.sourceId === ids.restrictedSource);
    assert.equal(restricted?.text, undefined);
    assert.equal(restricted?.textRestricted, true);
    assert.equal(restricted?.source.accessLevel, 'METADATA_ONLY');
    assert.equal(restricted?.source.rightsBasis, 'LICENSE_METADATA_ONLY');
    assert.deepEqual(body.aiSupplemental, []);

    assert.ok(!response.body.includes('Этот сохранённый текст не должен покидать сервер'));
    assert.ok(!response.body.includes('Непроверенный текст не должен попадать'));

    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/lessons/${ids.lesson}/content-context`,
      headers: { cookie, 'x-workspace-id': `missing-${suffix}` }
    });
    assert.equal(forbidden.statusCode, 403);
  } finally {
    await app.close();
    await pool.end();
  }
});
