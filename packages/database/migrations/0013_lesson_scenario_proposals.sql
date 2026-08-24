BEGIN;

ALTER TABLE lesson_invalidations
  DROP CONSTRAINT lesson_invalidations_source_kind_check;

ALTER TABLE lesson_invalidations
  ADD CONSTRAINT lesson_invalidations_source_kind_check
  CHECK (source_kind IN ('LESSON_DECISION', 'CONTENT_SELECTION', 'SCENARIO'));

CREATE TABLE lesson_scenario_proposals (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'READY', 'APPLIED', 'DISMISSED', 'STALE', 'FAILED', 'CANCELLED')),
  requested_lesson_version integer NOT NULL CHECK (requested_lesson_version > 0),
  context_guard_json jsonb NOT NULL,
  candidate_count_requested integer NOT NULL CHECK (candidate_count_requested BETWEEN 1 AND 3),
  teacher_instruction text,
  candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  async_job_id text NOT NULL REFERENCES async_jobs(id) ON DELETE RESTRICT,
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
  applied_candidate_id text,
  applied_by text REFERENCES users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  dismissed_by text REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  CHECK (jsonb_typeof(context_guard_json) = 'object'),
  CHECK (jsonb_typeof(candidates_json) = 'array'),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX lesson_scenario_proposals_lesson_idx
  ON lesson_scenario_proposals(workspace_id, lesson_id, created_at DESC);

CREATE INDEX lesson_scenario_proposals_active_idx
  ON lesson_scenario_proposals(workspace_id, lesson_id, status, created_at DESC)
  WHERE status IN ('QUEUED', 'RUNNING', 'READY');

CREATE TABLE lesson_scenarios (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status = 'APPROVED'),
  title text NOT NULL,
  rationale text NOT NULL,
  stages_json jsonb NOT NULL,
  source text NOT NULL DEFAULT 'TEACHER' CHECK (source = 'TEACHER'),
  origin_kind text NOT NULL CHECK (origin_kind IN ('AI_PROPOSAL', 'TEACHER')),
  origin_proposal_id text REFERENCES lesson_scenario_proposals(id) ON DELETE SET NULL,
  origin_candidate_id text,
  based_on_lesson_version integer NOT NULL CHECK (based_on_lesson_version > 0),
  approved_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(stages_json) = 'array'),
  UNIQUE (workspace_id, lesson_id)
);

CREATE INDEX lesson_scenarios_lesson_idx
  ON lesson_scenarios(workspace_id, lesson_id);

CREATE TABLE lesson_scenario_revisions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scenario_id text NOT NULL REFERENCES lesson_scenarios(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  title text NOT NULL,
  rationale text NOT NULL,
  stages_json jsonb NOT NULL,
  source text NOT NULL CHECK (source = 'TEACHER'),
  origin_kind text NOT NULL CHECK (origin_kind IN ('AI_PROPOSAL', 'TEACHER')),
  origin_proposal_id text REFERENCES lesson_scenario_proposals(id) ON DELETE SET NULL,
  origin_candidate_id text,
  based_on_lesson_version integer NOT NULL CHECK (based_on_lesson_version > 0),
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(stages_json) = 'array'),
  UNIQUE (scenario_id, revision)
);

CREATE INDEX lesson_scenario_revisions_lesson_idx
  ON lesson_scenario_revisions(workspace_id, lesson_id, revision DESC);

ALTER TABLE ai_invocations
  ADD COLUMN scenario_proposal_id text REFERENCES lesson_scenario_proposals(id) ON DELETE SET NULL;

CREATE INDEX ai_invocations_scenario_proposal_idx
  ON ai_invocations(workspace_id, scenario_proposal_id, started_at DESC)
  WHERE scenario_proposal_id IS NOT NULL;

COMMENT ON TABLE lesson_scenario_proposals IS
  'AI-generated lesson scenarios remain non-authoritative proposals until a teacher explicitly applies a candidate.';

COMMENT ON TABLE lesson_scenarios IS
  'Current teacher-approved scenario artifact. AI may be recorded as provenance, but source remains TEACHER after explicit apply.';

COMMIT;
