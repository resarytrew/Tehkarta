ALTER TABLE ai_invocations
  ADD COLUMN proposal_id text REFERENCES lesson_ai_proposals(id) ON DELETE SET NULL;

CREATE INDEX ai_invocations_proposal_idx
  ON ai_invocations(workspace_id, proposal_id, started_at DESC)
  WHERE proposal_id IS NOT NULL;
