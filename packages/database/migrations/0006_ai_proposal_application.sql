BEGIN;

ALTER TABLE lesson_ai_proposals
  ADD COLUMN applied_candidate_id text,
  ADD COLUMN applied_decision_id text REFERENCES lesson_decisions(id) ON DELETE SET NULL,
  ADD COLUMN applied_decision_revision integer CHECK (
    applied_decision_revision IS NULL OR applied_decision_revision > 0
  ),
  ADD COLUMN applied_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX lesson_ai_proposals_applied_decision_idx
  ON lesson_ai_proposals(workspace_id, applied_decision_id, applied_decision_revision)
  WHERE status = 'APPLIED';

COMMENT ON COLUMN lesson_ai_proposals.applied_candidate_id IS
  'Candidate explicitly selected and applied by the teacher. Selection alone never populates this field.';
COMMENT ON COLUMN lesson_ai_proposals.applied_decision_id IS
  'Authoritative governed decision created or revised by the explicit teacher apply action.';
COMMENT ON COLUMN lesson_ai_proposals.applied_decision_revision IS
  'Decision revision produced by the explicit teacher apply action.';
COMMENT ON COLUMN lesson_ai_proposals.applied_by IS
  'Teacher/user who explicitly promoted the proposal candidate into authoritative lesson state.';

COMMIT;
