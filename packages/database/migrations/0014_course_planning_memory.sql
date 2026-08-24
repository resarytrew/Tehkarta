BEGIN;

CREATE TABLE course_plans (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED')),
  goals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(goals) = 'array'),
  planned_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(planned_outcomes) = 'array'),
  content_summary text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, course_id)
);

CREATE INDEX course_plans_workspace_course_idx
  ON course_plans(workspace_id, course_id, status);

CREATE TABLE course_plan_revisions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_plan_id text NOT NULL REFERENCES course_plans(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED')),
  payload_json jsonb NOT NULL,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_plan_id, revision)
);

CREATE INDEX course_plan_revisions_workspace_plan_idx
  ON course_plan_revisions(workspace_id, course_plan_id, revision DESC);

CREATE TABLE course_lesson_progressions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_plan_id text NOT NULL REFERENCES course_plans(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  topic text NOT NULL,
  content_summary text NOT NULL DEFAULT '',
  concepts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(concepts) = 'array'),
  dates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dates) = 'array'),
  personalities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(personalities) = 'array'),
  expected_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(expected_outcomes) = 'array'),
  progress_status text NOT NULL DEFAULT 'PLANNED'
    CHECK (progress_status IN ('PLANNED', 'TAUGHT', 'ASSESSED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_plan_id, lesson_id),
  UNIQUE (course_plan_id, position)
);

CREATE INDEX course_lesson_progressions_course_idx
  ON course_lesson_progressions(workspace_id, course_plan_id, position);

CREATE TABLE course_source_bindings (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_document_id text NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,
  source_role text NOT NULL
    CHECK (source_role IN ('WORKING_PROGRAM', 'TEXTBOOK', 'METHOD_GUIDE', 'ATLAS', 'WORKBOOK', 'ASSESSMENT', 'OTHER')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, course_id, source_document_id)
);

CREATE INDEX course_source_bindings_course_idx
  ON course_source_bindings(workspace_id, course_id, status, source_role);

-- Local/private persistence for uploaded originals. Production deployments can
-- move these bytes to private Object Storage while keeping source_document_id.
CREATE TABLE source_document_blobs (
  source_document_id text PRIMARY KEY REFERENCES source_documents(id) ON DELETE CASCADE,
  owner_workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_document_blobs_workspace_idx
  ON source_document_blobs(owner_workspace_id, source_document_id);

COMMIT;
