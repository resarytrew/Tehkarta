BEGIN;

ALTER TABLE source_documents
  ADD COLUMN access_level text NOT NULL DEFAULT 'METADATA_ONLY'
    CHECK (access_level IN ('METADATA_ONLY', 'PREVIEW', 'FULL'));

-- Development fixtures are intentionally non-commercial and may expose their
-- seeded text. Existing real/imported sources remain metadata-only until an
-- administrator/import pipeline explicitly records the permitted access level.
UPDATE source_documents
SET access_level = 'FULL'
WHERE rights_basis = 'DEVELOPMENT_FIXTURE';

COMMENT ON COLUMN source_documents.access_level IS
  'Maximum content exposure allowed by the recorded rights basis. METADATA_ONLY and PREVIEW never expose source_units.text_content through lesson content context; FULL may expose it.';

COMMIT;
