BEGIN;

ALTER TABLE sessions
  ADD COLUMN csrf_secret_hash text;

CREATE INDEX sessions_token_active_idx
  ON sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
