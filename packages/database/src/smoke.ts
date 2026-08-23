import { Pool } from 'pg';
import { migrateDatabase } from './migrate.js';
import { PostgresLessonRepository } from './repositories/lesson.repository.js';
import type { RequestContext } from '@tehkarta/ports';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database smoke test.');
}

await migrateDatabase({ databaseUrl });

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const now = new Date().toISOString();

try {
  await pool.query(`
    INSERT INTO users(id, email, normalized_email, display_name)
    VALUES ('usr_smoke', 'smoke@example.test', 'smoke@example.test', 'Smoke Teacher');

    INSERT INTO workspaces(id, slug, name, created_by)
    VALUES ('ws_smoke', 'smoke', 'Smoke workspace', 'usr_smoke');

    INSERT INTO workspace_memberships(workspace_id, user_id, role)
    VALUES ('ws_smoke', 'usr_smoke', 'OWNER');

    INSERT INTO source_documents(
      id, source_kind, title, version, mime_type, checksum_sha256, rights_basis, processing_status
    ) VALUES (
      'src_curriculum_smoke', 'CURRICULUM', 'Smoke curriculum', '1',
      'application/pdf', 'smoke-curriculum-checksum', 'TEST_FIXTURE', 'READY'
    );

    INSERT INTO curriculum_packs(
      id, subject, grade_min, grade_max, academic_year, version, status, title, source_document_id
    ) VALUES (
      'cur_smoke', 'История', 9, 9, '2026/27', '1', 'PUBLISHED',
      'Smoke curriculum pack', 'src_curriculum_smoke'
    );

    INSERT INTO curriculum_courses(id, curriculum_pack_id, subject, grade, title, ordinal, planned_hours)
    VALUES ('cur_course_smoke', 'cur_smoke', 'История', 9, 'Всеобщая история', 1, 23);

    INSERT INTO curriculum_sections(id, curriculum_course_id, title, ordinal, planned_hours)
    VALUES ('cur_section_smoke', 'cur_course_smoke', 'Начало индустриальной эпохи', 1, 7);

    INSERT INTO curriculum_lessons(id, curriculum_section_id, title, ordinal, planned_hours, duration_minutes)
    VALUES ('cur_lesson_smoke', 'cur_section_smoke', 'Экономика делает решающий рывок', 1, 1, 45);

    INSERT INTO content_packs(
      id, subject, grade, academic_year, version, status, title, curriculum_pack_id
    ) VALUES (
      'content_smoke', 'История', 9, '2026/27', '1', 'PUBLISHED', 'Smoke UMK', 'cur_smoke'
    );

    INSERT INTO courses(
      id, workspace_id, owner_user_id, curriculum_course_id,
      curriculum_pack_id, curriculum_pack_version,
      content_pack_id, content_pack_version,
      subject, grade, academic_year, title, created_by
    ) VALUES (
      'course_smoke', 'ws_smoke', 'usr_smoke', 'cur_course_smoke',
      'cur_smoke', '1', 'content_smoke', '1',
      'История', 9, '2026/27', 'Всеобщая история', 'usr_smoke'
    );

    INSERT INTO course_sections(
      id, workspace_id, course_id, curriculum_section_id, position, title, planned_hours
    ) VALUES (
      'section_smoke', 'ws_smoke', 'course_smoke', 'cur_section_smoke', 1,
      'Начало индустриальной эпохи', 7
    );

    INSERT INTO lessons(
      id, workspace_id, course_id, section_id, curriculum_lesson_id,
      position, title, duration_minutes, created_by
    ) VALUES (
      'lesson_smoke', 'ws_smoke', 'course_smoke', 'section_smoke', 'cur_lesson_smoke',
      1, 'Экономика делает решающий рывок', 45, 'usr_smoke'
    );

    INSERT INTO lesson_decisions(
      id, workspace_id, lesson_id, semantic_key, value_json,
      source, status, revision, updated_by, approved_by, approved_at, updated_at
    ) VALUES (
      'field_problem_smoke', 'ws_smoke', 'lesson_smoke', 'problemQuestion',
      '"Почему произошёл промышленный рывок?"'::jsonb,
      'TEACHER', 'APPROVED', 1, 'usr_smoke', 'usr_smoke', now(), now()
    );
  `);

  let guardWorked = false;
  try {
    await pool.query(`
      UPDATE lesson_decisions
      SET value_json = '"AI silently replaced this"'::jsonb,
          source = 'AI',
          status = 'PROPOSED',
          revision = revision + 1
      WHERE id = 'field_problem_smoke'
    `);
  } catch (error: unknown) {
    guardWorked = Boolean(
      error && typeof error === 'object' && 'code' in error && error.code === '23514'
    );
  }

  if (!guardWorked) {
    throw new Error('Teacher-authority database guard did not reject an AI overwrite.');
  }

  const context: RequestContext = {
    requestId: 'req_smoke',
    workspaceId: 'ws_smoke',
    actorUserId: 'usr_smoke',
    roles: ['OWNER'],
    permissions: ['lesson:read', 'lesson:write']
  };

  const repository = new PostgresLessonRepository(pool);
  const lesson = await repository.getById(context, 'lesson_smoke');
  if (!lesson?.problemQuestion || lesson.problemQuestion.meta.status !== 'APPROVED') {
    throw new Error('Lesson repository did not restore the approved governed field.');
  }

  const otherWorkspaceContext: RequestContext = {
    ...context,
    requestId: 'req_smoke_other',
    workspaceId: 'ws_other'
  };
  const leaked = await repository.getById(otherWorkspaceContext, 'lesson_smoke');
  if (leaked !== null) {
    throw new Error('Tenant isolation smoke test failed: lesson leaked across workspaces.');
  }

  console.info(`[database] smoke test passed at ${now}`);
} finally {
  await pool.end();
}
