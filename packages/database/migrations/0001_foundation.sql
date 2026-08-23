BEGIN;

-- Identity -------------------------------------------------------------------

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL,
  normalized_email text NOT NULL UNIQUE,
  display_name text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE password_credentials (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  algorithm text NOT NULL DEFAULT 'argon2id',
  password_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  user_agent text,
  ip_hash text
);

CREATE INDEX sessions_user_active_idx
  ON sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

-- Workspaces / tenancy --------------------------------------------------------

CREATE TABLE workspaces (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'PERSONAL' CHECK (kind IN ('PERSONAL', 'SCHOOL', 'ORGANIZATION')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE workspace_memberships (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_memberships_user_idx ON workspace_memberships(user_id, status);

-- Source documents ------------------------------------------------------------
-- owner_workspace_id IS NULL means platform-owned/global licensed content.

CREATE TABLE source_documents (
  id text PRIMARY KEY,
  owner_workspace_id text REFERENCES workspaces(id) ON DELETE SET NULL,
  source_kind text NOT NULL,
  title text NOT NULL,
  version text NOT NULL,
  mime_type text NOT NULL,
  object_bucket text,
  object_key text,
  checksum_sha256 text NOT NULL,
  rights_basis text NOT NULL DEFAULT 'UNSPECIFIED',
  processing_status text NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checksum_sha256, version)
);

CREATE INDEX source_documents_owner_idx ON source_documents(owner_workspace_id, source_kind);
CREATE INDEX source_documents_processing_idx ON source_documents(processing_status);

CREATE TABLE source_units (
  id text PRIMARY KEY,
  source_document_id text NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  parent_id text REFERENCES source_units(id) ON DELETE CASCADE,
  unit_type text NOT NULL,
  ordinal integer NOT NULL DEFAULT 0,
  title text,
  page_start integer,
  page_end integer,
  text_content text,
  content_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (page_start IS NULL OR page_start > 0),
  CHECK (page_end IS NULL OR page_end > 0),
  CHECK (page_start IS NULL OR page_end IS NULL OR page_end >= page_start)
);

CREATE INDEX source_units_document_parent_idx
  ON source_units(source_document_id, parent_id, ordinal);
CREATE INDEX source_units_content_hash_idx ON source_units(content_hash) WHERE content_hash IS NOT NULL;

-- Curriculum catalog ----------------------------------------------------------

CREATE TABLE curriculum_packs (
  id text PRIMARY KEY,
  subject text NOT NULL,
  grade_min integer NOT NULL CHECK (grade_min BETWEEN 1 AND 11),
  grade_max integer NOT NULL CHECK (grade_max BETWEEN 1 AND 11),
  academic_year text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  title text NOT NULL,
  source_document_id text REFERENCES source_documents(id) ON DELETE RESTRICT,
  checksum_sha256 text,
  supersedes_id text REFERENCES curriculum_packs(id) ON DELETE SET NULL,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (grade_max >= grade_min),
  UNIQUE (subject, academic_year, version)
);

CREATE TABLE curriculum_courses (
  id text PRIMARY KEY,
  curriculum_pack_id text NOT NULL REFERENCES curriculum_packs(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 11),
  title text NOT NULL,
  ordinal integer NOT NULL,
  planned_hours numeric(6,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (curriculum_pack_id, grade, ordinal)
);

CREATE TABLE curriculum_sections (
  id text PRIMARY KEY,
  curriculum_course_id text NOT NULL REFERENCES curriculum_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  ordinal integer NOT NULL,
  planned_hours numeric(6,2) NOT NULL CHECK (planned_hours >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (curriculum_course_id, ordinal)
);

CREATE TABLE curriculum_lessons (
  id text PRIMARY KEY,
  curriculum_section_id text NOT NULL REFERENCES curriculum_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  ordinal integer NOT NULL,
  planned_hours numeric(6,2) NOT NULL DEFAULT 1 CHECK (planned_hours > 0),
  duration_minutes integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (curriculum_section_id, ordinal)
);

CREATE TABLE curriculum_requirements (
  id text PRIMARY KEY,
  curriculum_pack_id text NOT NULL REFERENCES curriculum_packs(id) ON DELETE CASCADE,
  code text,
  kind text NOT NULL CHECK (kind IN ('CONTENT', 'OUTCOME', 'ASSESSMENT', 'HOURS')),
  text_content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX curriculum_requirements_pack_kind_idx
  ON curriculum_requirements(curriculum_pack_id, kind);

CREATE TABLE curriculum_requirement_allocations (
  id text PRIMARY KEY,
  requirement_id text NOT NULL REFERENCES curriculum_requirements(id) ON DELETE CASCADE,
  curriculum_course_id text REFERENCES curriculum_courses(id) ON DELETE CASCADE,
  curriculum_section_id text REFERENCES curriculum_sections(id) ON DELETE CASCADE,
  curriculum_lesson_id text REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  allocation_stage text NOT NULL DEFAULT 'MANDATORY'
    CHECK (allocation_stage IN ('MANDATORY', 'INTRODUCE', 'DEVELOP', 'APPLY', 'ASSESS')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    num_nonnulls(curriculum_course_id, curriculum_section_id, curriculum_lesson_id) = 1
  )
);

CREATE INDEX curriculum_requirement_allocations_requirement_idx
  ON curriculum_requirement_allocations(requirement_id);
CREATE INDEX curriculum_requirement_allocations_lesson_idx
  ON curriculum_requirement_allocations(curriculum_lesson_id)
  WHERE curriculum_lesson_id IS NOT NULL;

-- UMK/content catalog ----------------------------------------------------------

CREATE TABLE content_packs (
  id text PRIMARY KEY,
  subject text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 11),
  academic_year text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  title text NOT NULL,
  curriculum_pack_id text NOT NULL REFERENCES curriculum_packs(id) ON DELETE RESTRICT,
  supersedes_id text REFERENCES content_packs(id) ON DELETE SET NULL,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, grade, academic_year, version)
);

CREATE TABLE content_pack_sources (
  id text PRIMARY KEY,
  content_pack_id text NOT NULL REFERENCES content_packs(id) ON DELETE CASCADE,
  source_document_id text NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,
  resource_type text NOT NULL
    CHECK (resource_type IN ('TEXTBOOK', 'METHOD_GUIDE', 'ATLAS', 'WORKBOOK', 'ASSESSMENT', 'DIGITAL', 'OTHER')),
  ordinal integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (content_pack_id, source_document_id)
);

CREATE TABLE content_mappings (
  id text PRIMARY KEY,
  content_pack_id text NOT NULL REFERENCES content_packs(id) ON DELETE CASCADE,
  curriculum_course_id text REFERENCES curriculum_courses(id) ON DELETE CASCADE,
  curriculum_section_id text REFERENCES curriculum_sections(id) ON DELETE CASCADE,
  curriculum_lesson_id text REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  source_unit_id text NOT NULL REFERENCES source_units(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'PRIMARY'
    CHECK (relation_type IN ('PRIMARY', 'SUPPORTING', 'ASSESSMENT', 'EXTENSION')),
  confidence numeric(5,4),
  review_status text NOT NULL DEFAULT 'UNREVIEWED'
    CHECK (review_status IN ('UNREVIEWED', 'APPROVED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CHECK (
    num_nonnulls(curriculum_course_id, curriculum_section_id, curriculum_lesson_id) = 1
  )
);

CREATE INDEX content_mappings_lesson_idx
  ON content_mappings(content_pack_id, curriculum_lesson_id)
  WHERE curriculum_lesson_id IS NOT NULL;

-- Teacher course planning -----------------------------------------------------

CREATE TABLE courses (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  curriculum_course_id text REFERENCES curriculum_courses(id) ON DELETE RESTRICT,
  curriculum_pack_id text NOT NULL REFERENCES curriculum_packs(id) ON DELETE RESTRICT,
  curriculum_pack_version text NOT NULL,
  content_pack_id text NOT NULL REFERENCES content_packs(id) ON DELETE RESTRICT,
  content_pack_version text NOT NULL,
  subject text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 11),
  academic_year text NOT NULL,
  title text NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'ARCHIVED')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX courses_workspace_year_idx ON courses(workspace_id, academic_year, state);

CREATE TABLE course_sections (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  curriculum_section_id text REFERENCES curriculum_sections(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  position integer NOT NULL,
  title text NOT NULL,
  planned_hours numeric(6,2) NOT NULL CHECK (planned_hours >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, position)
);

CREATE INDEX course_sections_workspace_course_idx ON course_sections(workspace_id, course_id);

CREATE TABLE lessons (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id text NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  curriculum_lesson_id text REFERENCES curriculum_lessons(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  position integer NOT NULL,
  title text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45 CHECK (duration_minutes > 0 AND duration_minutes <= 300),
  state text NOT NULL DEFAULT 'PLANNED'
    CHECK (state IN ('PLANNED', 'DESIGNING', 'READY', 'ARCHIVED')),
  design_mode text NOT NULL DEFAULT 'BALANCED'
    CHECK (design_mode IN ('REGULATED', 'BALANCED', 'CREATIVE')),
  content_freedom text NOT NULL DEFAULT 'TEXTBOOK_PLUS'
    CHECK (content_freedom IN ('TEXTBOOK_STRICT', 'TEXTBOOK_PLUS', 'EXPANDED')),
  method_freedom text NOT NULL DEFAULT 'FLEXIBLE'
    CHECK (method_freedom IN ('CLASSIC', 'FLEXIBLE', 'EXPERIMENTAL')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (section_id, position)
);

CREATE INDEX lessons_workspace_course_idx ON lessons(workspace_id, course_id, section_id);

-- Governed teacher decisions --------------------------------------------------
-- One current row per semantic field/list item; immutable history is separate.

CREATE TABLE lesson_decisions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  semantic_key text NOT NULL,
  item_key text NOT NULL DEFAULT 'single',
  ordinal integer NOT NULL DEFAULT 0,
  value_json jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('AI', 'TEACHER', 'CURRICULUM', 'UMK', 'SYSTEM')),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'EDITED', 'APPROVED')),
  revision integer NOT NULL CHECK (revision > 0),
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, semantic_key, item_key)
);

CREATE INDEX lesson_decisions_workspace_lesson_idx
  ON lesson_decisions(workspace_id, lesson_id, semantic_key, ordinal);
CREATE INDEX lesson_decisions_approved_idx
  ON lesson_decisions(lesson_id, semantic_key)
  WHERE status = 'APPROVED';

CREATE TABLE lesson_decision_revisions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  decision_id text NOT NULL REFERENCES lesson_decisions(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  value_json jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('AI', 'TEACHER', 'CURRICULUM', 'UMK', 'SYSTEM')),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'EDITED', 'APPROVED')),
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (decision_id, revision)
);

CREATE INDEX lesson_decision_revisions_lesson_idx
  ON lesson_decision_revisions(workspace_id, lesson_id, decision_id, revision DESC);

CREATE TABLE lesson_invalidations (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  source_decision_id text NOT NULL REFERENCES lesson_decisions(id) ON DELETE CASCADE,
  source_revision integer NOT NULL,
  affected_semantic_key text NOT NULL,
  status text NOT NULL DEFAULT 'STALE' CHECK (status IN ('STALE', 'RESOLVED', 'IGNORED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);

CREATE INDEX lesson_invalidations_open_idx
  ON lesson_invalidations(workspace_id, lesson_id, status)
  WHERE status = 'STALE';

-- Reliable API / async processing ---------------------------------------------

CREATE TABLE idempotency_records (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (workspace_id, operation, idempotency_key)
);

CREATE TABLE async_jobs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  idempotency_key text NOT NULL,
  payload_json jsonb NOT NULL,
  result_json jsonb,
  error_json jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (workspace_id, job_type, idempotency_key)
);

CREATE INDEX async_jobs_claim_idx
  ON async_jobs(status, available_at, created_at)
  WHERE status IN ('QUEUED', 'FAILED');

CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  schema_version text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload_json jsonb NOT NULL,
  correlation_id text,
  causation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  publish_attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX outbox_events_unpublished_idx
  ON outbox_events(created_at)
  WHERE published_at IS NULL;

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  request_id text,
  payload_json jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_resource_idx
  ON audit_events(workspace_id, resource_type, resource_id, occurred_at DESC);

-- AI traceability --------------------------------------------------------------

CREATE TABLE ai_invocations (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text REFERENCES lessons(id) ON DELETE SET NULL,
  job_id text REFERENCES async_jobs(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  routing_policy_version text NOT NULL,
  input_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cost_microunits bigint,
  error_class text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ai_invocations_workspace_task_idx
  ON ai_invocations(workspace_id, task_type, started_at DESC);
CREATE INDEX ai_invocations_lesson_idx
  ON ai_invocations(workspace_id, lesson_id, started_at DESC)
  WHERE lesson_id IS NOT NULL;

COMMIT;
