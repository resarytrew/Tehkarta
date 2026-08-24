ALTER TABLE lesson_invalidations
  DROP CONSTRAINT lesson_invalidations_source_decision_id_fkey;

ALTER TABLE lesson_invalidations
  ADD COLUMN source_kind text NOT NULL DEFAULT 'LESSON_DECISION'
    CHECK (source_kind IN ('LESSON_DECISION', 'CONTENT_SELECTION'));

CREATE INDEX lesson_invalidations_source_idx
  ON lesson_invalidations(workspace_id, lesson_id, source_kind, source_decision_id, source_revision);

COMMENT ON COLUMN lesson_invalidations.source_kind IS
  'Kind of approved upstream entity that made a dependent lesson artifact stale. source_decision_id is retained as a backward-compatible identifier column.';
