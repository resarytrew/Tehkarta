BEGIN;

ALTER TABLE lesson_ai_proposals
  ADD COLUMN dismissed_by text REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN lesson_ai_proposals.dismissed_by IS
  'Teacher/user who explicitly rejected a READY AI proposal. Dismissal never changes lesson_decisions.';

COMMIT;
