import { Pool } from 'pg';
import { Argon2idPasswordHasher, normalizeEmail } from '@tehkarta/identity';
import { history9IndustrialLessons } from '@tehkarta/domain';
import { migrateDatabase } from './migrate.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('bootstrap-dev is forbidden in production.');
}

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.DEV_BOOTSTRAP_EMAIL?.trim();
const password = process.env.DEV_BOOTSTRAP_PASSWORD;
const displayName = process.env.DEV_BOOTSTRAP_NAME?.trim() || 'Педагог';

if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!email) throw new Error('DEV_BOOTSTRAP_EMAIL is required.');
if (!password || password.length < 12) {
  throw new Error('DEV_BOOTSTRAP_PASSWORD must contain at least 12 characters.');
}

await migrateDatabase({ databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const passwordHash = await new Argon2idPasswordHasher().hash(password);
const normalizedEmail = normalizeEmail(email);

const ids = {
  user: 'usr_dev_teacher',
  workspace: 'ws_dev_teacher',
  source: 'src_dev_history9_curriculum',
  curriculumPack: 'curriculum-history-5-9-2026',
  curriculumCourse: 'cur-history9-world-modern-xix',
  curriculumSection: 'cur-history9-industrial-era',
  contentPack: 'umk-history-9-2026',
  course: 'history-9-world-modern-xix',
  section: 'industrial-era'
} as const;

const lessonIds = [
  'industrial-01-economy-leap',
  'industrial-02-society-motion',
  'industrial-03-ideologies',
  'industrial-04-reforms',
  'industrial-05-science-education',
  'industrial-06-artistic-search',
  'industrial-07-international-relations'
] as const;

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(
    `INSERT INTO users(id, email, normalized_email, display_name, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       normalized_email = EXCLUDED.normalized_email,
       display_name = EXCLUDED.display_name,
       status = 'ACTIVE',
       updated_at = now(),
       deleted_at = NULL`,
    [ids.user, email, normalizedEmail, displayName]
  );

  await client.query(
    `INSERT INTO password_credentials(user_id, password_hash, algorithm, password_updated_at)
     VALUES ($1, $2, 'argon2id', now())
     ON CONFLICT (user_id) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       algorithm = 'argon2id',
       password_updated_at = now()`,
    [ids.user, passwordHash]
  );

  await client.query(
    `INSERT INTO workspaces(id, slug, name, kind, created_by)
     VALUES ($1, 'dev-teacher', 'Личная рабочая область', 'PERSONAL', $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
    [ids.workspace, ids.user]
  );

  await client.query(
    `INSERT INTO workspace_memberships(workspace_id, user_id, role, permissions, status)
     VALUES (
       $1, $2, 'OWNER',
       '["workspace:admin","course:read","course:write","lesson:read","lesson:write","content:read"]'::jsonb,
       'ACTIVE'
     )
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       permissions = EXCLUDED.permissions,
       status = 'ACTIVE'`,
    [ids.workspace, ids.user]
  );

  await client.query(
    `INSERT INTO source_documents(
       id, source_kind, title, version, mime_type, checksum_sha256,
       rights_basis, processing_status
     ) VALUES (
       $1, 'CURRICULUM', 'Development curriculum fixture: History 9', '1.0.0',
       'application/json', 'dev-history9-curriculum-fixture', 'DEVELOPMENT_FIXTURE', 'READY'
     )
     ON CONFLICT (id) DO NOTHING`,
    [ids.source]
  );

  await client.query(
    `INSERT INTO curriculum_packs(
       id, subject, grade_min, grade_max, academic_year, version, status, title, source_document_id
     ) VALUES (
       $1, 'История', 9, 9, '2026/27', '1.0.0', 'PUBLISHED',
       'История 9 класса · рабочая программа (dev fixture)', $2
     )
     ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED'`,
    [ids.curriculumPack, ids.source]
  );

  await client.query(
    `INSERT INTO curriculum_courses(
       id, curriculum_pack_id, subject, grade, title, ordinal, planned_hours
     ) VALUES ($1, $2, 'История', 9, $3, 1, 23)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
    [
      ids.curriculumCourse,
      ids.curriculumPack,
      'Всеобщая история. История Нового времени. XIX — начало XX в.'
    ]
  );

  await client.query(
    `INSERT INTO curriculum_sections(
       id, curriculum_course_id, title, ordinal, planned_hours
     ) VALUES ($1, $2, 'Начало индустриальной эпохи', 1, 7)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, planned_hours = EXCLUDED.planned_hours`,
    [ids.curriculumSection, ids.curriculumCourse]
  );

  for (const [index, title] of history9IndustrialLessons.entries()) {
    const curriculumLessonId = `cur-${lessonIds[index]}`;
    await client.query(
      `INSERT INTO curriculum_lessons(
         id, curriculum_section_id, title, ordinal, planned_hours, duration_minutes
       ) VALUES ($1, $2, $3, $4, 1, 45)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, ordinal = EXCLUDED.ordinal`,
      [curriculumLessonId, ids.curriculumSection, title, index + 1]
    );
  }

  await client.query(
    `INSERT INTO content_packs(
       id, subject, grade, academic_year, version, status, title, curriculum_pack_id
     ) VALUES (
       $1, 'История', 9, '2026/27', '1.0.0', 'PUBLISHED',
       'История 9 класса · УМК (dev fixture)', $2
     )
     ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED'`,
    [ids.contentPack, ids.curriculumPack]
  );

  await client.query(
    `INSERT INTO courses(
       id, workspace_id, owner_user_id, curriculum_course_id,
       curriculum_pack_id, curriculum_pack_version, content_pack_id, content_pack_version,
       subject, grade, academic_year, title, created_by
     ) VALUES ($1, $2, $3, $4, $5, '1.0.0', $6, '1.0.0', 'История', 9, '2026/27', $7, $3)
     ON CONFLICT (id) DO UPDATE SET
       owner_user_id = EXCLUDED.owner_user_id,
       title = EXCLUDED.title,
       archived_at = NULL,
       state = 'ACTIVE',
       updated_at = now()`,
    [
      ids.course,
      ids.workspace,
      ids.user,
      ids.curriculumCourse,
      ids.curriculumPack,
      ids.contentPack,
      'Всеобщая история. История Нового времени. XIX — начало XX в.'
    ]
  );

  await client.query(
    `INSERT INTO course_sections(
       id, workspace_id, course_id, curriculum_section_id, position, title, planned_hours
     ) VALUES ($1, $2, $3, $4, 1, 'Начало индустриальной эпохи', 7)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       planned_hours = EXCLUDED.planned_hours,
       archived_at = NULL,
       updated_at = now()`,
    [ids.section, ids.workspace, ids.course, ids.curriculumSection]
  );

  for (const [index, title] of history9IndustrialLessons.entries()) {
    const lessonId = lessonIds[index];
    await client.query(
      `INSERT INTO lessons(
         id, workspace_id, course_id, section_id, curriculum_lesson_id,
         position, title, duration_minutes, state, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 45, 'PLANNED', $8)
       ON CONFLICT (id) DO UPDATE SET
         position = EXCLUDED.position,
         title = EXCLUDED.title,
         archived_at = NULL,
         updated_at = now()`,
      [
        lessonId,
        ids.workspace,
        ids.course,
        ids.section,
        `cur-${lessonId}`,
        index + 1,
        title,
        ids.user
      ]
    );
  }

  await client.query('COMMIT');
  console.info(`[database] development teacher ready: ${email}`);
  console.info(`[database] workspace: ${ids.workspace}; first lesson: ${lessonIds[0]}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
