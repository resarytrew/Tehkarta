BEGIN;

ALTER TABLE course_sections
  ADD COLUMN archived_at timestamptz;

ALTER TABLE course_sections
  DROP CONSTRAINT IF EXISTS course_sections_course_id_position_key;

CREATE UNIQUE INDEX course_sections_active_position_uidx
  ON course_sections(course_id, position)
  WHERE archived_at IS NULL;

ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_section_id_position_key;

CREATE UNIQUE INDEX lessons_active_position_uidx
  ON lessons(section_id, position)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION prevent_ai_overwrite_of_approved_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'APPROVED'
     AND NEW.source = 'AI'
     AND (
       NEW.value_json IS DISTINCT FROM OLD.value_json
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.revision IS DISTINCT FROM OLD.revision
     ) THEN
    RAISE EXCEPTION 'AI cannot overwrite approved lesson decision %', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER lesson_decisions_teacher_authority_guard
BEFORE UPDATE ON lesson_decisions
FOR EACH ROW
EXECUTE FUNCTION prevent_ai_overwrite_of_approved_decision();

COMMIT;
