BEGIN;

CREATE TABLE lesson_ai_proposals (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  semantic_key text NOT NULL CHECK (semantic_key IN ('goal', 'problemQuestion', 'bigIdea')),
  action text NOT NULL CHECK (action IN ('VARIANTS', 'REGENERATE', 'IMPROVE')),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'READY', 'APPLIED', 'DISMISSED', 'STALE', 'FAILED', 'CANCELLED')),
  base_decision_id text REFERENCES lesson_decisions(id) ON DELETE SET NULL,
  base_revision integer CHECK (base_revision IS NULL OR base_revision > 0),
  base_value_json jsonb,
  requested_lesson_version integer NOT NULL CHECK (requested_lesson_version > 0),
  candidate_count_requested integer NOT NULL CHECK (candidate_count_requested BETWEEN 1 AND 5),
  teacher_instruction text,
  candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  async_job_id text NOT NULL REFERENCES async_jobs(id) ON DELETE RESTRICT,
  ai_invocation_id text REFERENCES ai_invocations(id) ON DELETE SET NULL,
  provider text,
  model text,
  prompt_version text,
  routing_policy_version text,
  idempotency_key text NOT NULL,
  requested_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  applied_at timestamptz,
  dismissed_at timestamptz,
  CHECK (jsonb_typeof(candidates_json) = 'array'),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX lesson_ai_proposals_lesson_idx
  ON lesson_ai_proposals(workspace_id, lesson_id, semantic_key, created_at DESC);

CREATE INDEX lesson_ai_proposals_active_idx
  ON lesson_ai_proposals(workspace_id, lesson_id, status, created_at DESC)
  WHERE status IN ('QUEUED', 'RUNNING', 'READY');

COMMENT ON TABLE lesson_ai_proposals IS
  'AI suggestions are persisted separately from authoritative lesson decisions. A proposal never mutates lesson_decisions by itself.';

COMMIT;
