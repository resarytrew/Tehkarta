BEGIN;

CREATE TABLE knowledge_spaces (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  subject_id text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 11),
  umk_id text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);

CREATE UNIQUE INDEX knowledge_spaces_active_identity_idx
  ON knowledge_spaces(workspace_id, subject_id, grade, umk_id)
  WHERE status <> 'ARCHIVED';

CREATE INDEX knowledge_spaces_scope_idx
  ON knowledge_spaces(workspace_id, subject_id, grade, umk_id, status);

CREATE TABLE knowledge_documents (
  id text PRIMARY KEY,
  knowledge_space_id text NOT NULL,
  workspace_id text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'WORKING_PROGRAM', 'TEXTBOOK', 'METHOD_GUIDE', 'ATLAS',
    'WORKBOOK', 'ASSESSMENT', 'LOCAL_MATERIAL'
  )),
  title text NOT NULL,
  mime_type text NOT NULL,
  source_revision text NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW', 'PUBLISHED', 'FAILED')),
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0 AND chunk_count <= 2000),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  FOREIGN KEY (knowledge_space_id, workspace_id)
    REFERENCES knowledge_spaces(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (knowledge_space_id, checksum_sha256, source_revision),
  UNIQUE (id, knowledge_space_id, workspace_id)
);

CREATE INDEX knowledge_documents_space_idx
  ON knowledge_documents(workspace_id, knowledge_space_id, status, document_type);

CREATE TABLE knowledge_chunks (
  id text PRIMARY KEY,
  knowledge_space_id text NOT NULL,
  document_id text NOT NULL,
  workspace_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  text_content text NOT NULL,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  embedding double precision[] NOT NULL CHECK (cardinality(embedding) = 64),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', text_content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_id, knowledge_space_id, workspace_id)
    REFERENCES knowledge_documents(id, knowledge_space_id, workspace_id) ON DELETE CASCADE,
  UNIQUE (document_id, ordinal)
);

CREATE INDEX knowledge_chunks_scope_idx
  ON knowledge_chunks(workspace_id, knowledge_space_id, document_id, ordinal);

CREATE INDEX knowledge_chunks_lexical_idx
  ON knowledge_chunks USING gin(search_vector);

ALTER TABLE courses
  ADD COLUMN knowledge_space_id text;

ALTER TABLE courses
  ADD CONSTRAINT courses_knowledge_space_fk
  FOREIGN KEY (knowledge_space_id, workspace_id)
  REFERENCES knowledge_spaces(id, workspace_id) ON DELETE RESTRICT;

CREATE INDEX courses_knowledge_space_idx
  ON courses(workspace_id, knowledge_space_id)
  WHERE knowledge_space_id IS NOT NULL;

COMMIT;
