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
  umkSource: 'src_dev_history9_umk',
  curriculumPack: 'curriculum-history-5-9-2026',
  curriculumCourse: 'cur-history9-world-modern-xix',
  curriculumSection: 'cur-history9-industrial-era',
  contentPack: 'umk-history-9-2026',
  contentPackSource: 'cps_dev_history9_textbook',
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

const firstCurriculumLessonId = `cur-${lessonIds[0]}`;
const umkUnits = [
  {
    id: 'su_dev_history9_industrial01_second_revolution',
    type: 'CONCEPT',
    ordinal: 1,
    title: 'Вторая промышленная революция',
    text: 'DEV FIXTURE: новый этап индустриального развития связан с распространением электричества, химической промышленности, новых видов транспорта и крупного машинного производства.',
    relation: 'PRIMARY'
  },
  {
    id: 'su_dev_history9_industrial01_monopoly',
    type: 'CONCEPT',
    ordinal: 2,
    title: 'Монополия',
    text: 'DEV FIXTURE: крупные объединения предприятий стремятся контролировать производство и рынок; эта учебная формулировка создана только для разработки интерфейса.',
    relation: 'PRIMARY'
  },
  {
    id: 'su_dev_history9_industrial01_causal',
    type: 'CAUSAL_MODEL',
    ordinal: 3,
    title: 'Причины промышленного рывка',
    text: 'DEV FIXTURE: научно-технические новшества, инвестиции, расширение рынков и развитие транспорта взаимно усиливают рост промышленного производства.',
    relation: 'SUPPORTING'
  },
  {
    id: 'su_dev_history9_industrial01_table',
    type: 'TABLE',
    ordinal: 4,
    title: 'Факторы и проявления индустриального роста',
    text: 'DEV FIXTURE: учебная таблица для сопоставления технологии, капитала, транспорта, производства и рыночной концентрации.',
    relation: 'SUPPORTING'
  },
  {
    id: 'su_dev_history9_industrial01_task',
    type: 'TASK',
    ordinal: 5,
    title: 'Задание на причинно-следственное объяснение',
    text: 'DEV FIXTURE: выберите три фактора промышленного рывка и постройте цепочку «факт → влияние → следствие → вывод».',
    relation: 'ASSESSMENT'
  }
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
       rights_basis, processing_status, access_level
     ) VALUES (
       $1, 'CURRICULUM', 'Development curriculum fixture: History 9', '1.0.0',
       'application/json', 'dev-history9-curriculum-fixture', 'DEVELOPMENT_FIXTURE', 'READY', 'FULL'
     )
     ON CONFLICT (id) DO UPDATE SET
       processing_status = 'READY',
       access_level = 'FULL',
       updated_at = now()`,
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

  const requirements = [
    {
      id: 'req_dev_history9_industrial01_content',
      code: 'DEV-RP-CONTENT-01',
      kind: 'CONTENT',
      stage: 'MANDATORY',
      text: 'DEV FIXTURE: индустриализация XIX века; вторая промышленная революция; формирование крупных монополистических объединений.'
    },
    {
      id: 'req_dev_history9_industrial01_outcome',
      code: 'DEV-RP-OUTCOME-01',
      kind: 'OUTCOME',
      stage: 'DEVELOP',
      text: 'DEV FIXTURE: объяснять причины промышленного рывка XIX века, используя факты и причинно-следственные связи.'
    },
    {
      id: 'req_dev_history9_industrial01_assessment',
      code: 'DEV-RP-ASSESS-01',
      kind: 'ASSESSMENT',
      stage: 'ASSESS',
      text: 'DEV FIXTURE: подтверждать вывод об индустриальном развитии не менее чем двумя релевантными фактами.'
    }
  ] as const;

  for (const requirement of requirements) {
    await client.query(
      `INSERT INTO curriculum_requirements(
         id, curriculum_pack_id, code, kind, text_content, metadata
       ) VALUES ($1, $2, $3, $4, $5, '{"fixture":true}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         kind = EXCLUDED.kind,
         text_content = EXCLUDED.text_content,
         metadata = EXCLUDED.metadata`,
      [requirement.id, ids.curriculumPack, requirement.code, requirement.kind, requirement.text]
    );
    await client.query(
      `INSERT INTO curriculum_requirement_allocations(
         id, requirement_id, curriculum_lesson_id, allocation_stage
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         requirement_id = EXCLUDED.requirement_id,
         curriculum_lesson_id = EXCLUDED.curriculum_lesson_id,
         allocation_stage = EXCLUDED.allocation_stage`,
      [`alloc_${requirement.id}`, requirement.id, firstCurriculumLessonId, requirement.stage]
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
    `INSERT INTO source_documents(
       id, source_kind, title, version, mime_type, checksum_sha256,
       rights_basis, processing_status, access_level, metadata
     ) VALUES (
       $1, 'TEXTBOOK', 'Development UMK fixture: History 9', '1.0.0',
       'application/json', 'dev-history9-umk-fixture', 'DEVELOPMENT_FIXTURE', 'READY', 'FULL',
       '{"fixture":true,"notice":"Synthetic development content; not a commercial textbook."}'::jsonb
     )
     ON CONFLICT (id) DO UPDATE SET
       processing_status = 'READY',
       access_level = 'FULL',
       metadata = EXCLUDED.metadata,
       updated_at = now()`,
    [ids.umkSource]
  );

  await client.query(
    `INSERT INTO content_pack_sources(
       id, content_pack_id, source_document_id, resource_type, ordinal, required, metadata
     ) VALUES ($1, $2, $3, 'TEXTBOOK', 1, true, '{"fixture":true}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       source_document_id = EXCLUDED.source_document_id,
       resource_type = EXCLUDED.resource_type,
       ordinal = EXCLUDED.ordinal,
       required = EXCLUDED.required,
       metadata = EXCLUDED.metadata`,
    [ids.contentPackSource, ids.contentPack, ids.umkSource]
  );

  const paragraphId = 'su_dev_history9_industrial01_paragraph';
  await client.query(
    `INSERT INTO source_units(
       id, source_document_id, unit_type, ordinal, title, text_content, content_hash, metadata
     ) VALUES (
       $1, $2, 'PARAGRAPH', 1, 'Экономика делает решающий рывок · DEV FIXTURE',
       NULL, 'dev-history9-industrial01-paragraph', '{"fixture":true}'::jsonb
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       metadata = EXCLUDED.metadata`,
    [paragraphId, ids.umkSource]
  );

  for (const unit of umkUnits) {
    await client.query(
      `INSERT INTO source_units(
         id, source_document_id, parent_id, unit_type, ordinal, title,
         text_content, content_hash, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{"fixture":true}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         parent_id = EXCLUDED.parent_id,
         unit_type = EXCLUDED.unit_type,
         ordinal = EXCLUDED.ordinal,
         title = EXCLUDED.title,
         text_content = EXCLUDED.text_content,
         content_hash = EXCLUDED.content_hash,
         metadata = EXCLUDED.metadata`,
      [
        unit.id,
        ids.umkSource,
        paragraphId,
        unit.type,
        unit.ordinal,
        unit.title,
        unit.text,
        `dev-hash-${unit.id}`
      ]
    );
    await client.query(
      `INSERT INTO content_mappings(
         id, content_pack_id, curriculum_lesson_id, source_unit_id,
         relation_type, confidence, review_status
       ) VALUES ($1, $2, $3, $4, $5, 1.0000, 'APPROVED')
       ON CONFLICT (id) DO UPDATE SET
         source_unit_id = EXCLUDED.source_unit_id,
         relation_type = EXCLUDED.relation_type,
         confidence = EXCLUDED.confidence,
         review_status = 'APPROVED',
         reviewed_at = now()`,
      [`map_${unit.id}`, ids.contentPack, firstCurriculumLessonId, unit.id, unit.relation]
    );
  }

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
  console.info('[database] RP/UMK content context seeded from explicit development fixtures only.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
