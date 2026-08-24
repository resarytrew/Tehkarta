BEGIN;

CREATE TABLE lesson_design_artifacts (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('SCENARIO', 'MATERIALS')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload_json jsonb NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, lesson_id, kind)
);

CREATE INDEX lesson_design_artifacts_lesson_idx
  ON lesson_design_artifacts(workspace_id, lesson_id, kind);

COMMIT;
