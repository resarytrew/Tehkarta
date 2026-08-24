CREATE TABLE lesson_methodology_feedback (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  recommendation_id text NOT NULL,
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('REJECTED')),
  actor_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, lesson_id, recommendation_id)
);

CREATE INDEX lesson_methodology_feedback_lesson_idx
  ON lesson_methodology_feedback(workspace_id, lesson_id, created_at DESC);
