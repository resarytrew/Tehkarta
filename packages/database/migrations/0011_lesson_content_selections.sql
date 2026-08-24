CREATE TABLE lesson_content_selections (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('UMK')),
  source_ref_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('INCLUDED', 'EXCLUDED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  content_pack_id text NOT NULL REFERENCES content_packs(id),
  content_pack_version text NOT NULL,
  source_document_id text NOT NULL REFERENCES source_documents(id),
  source_document_version text NOT NULL,
  source_unit_id text NOT NULL REFERENCES source_units(id),
  title_snapshot text NOT NULL,
  content_hash text,
  actor_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, lesson_id, source_kind, source_ref_id)
);

CREATE INDEX lesson_content_selections_lesson_idx
  ON lesson_content_selections(workspace_id, lesson_id, decision, updated_at DESC);

COMMENT ON TABLE lesson_content_selections IS
  'Explicit teacher-approved include/exclude decisions for lesson content. Stores provenance snapshots but never licensed source text.';
