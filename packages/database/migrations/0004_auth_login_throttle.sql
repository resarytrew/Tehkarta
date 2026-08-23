BEGIN;

-- Login throttling ------------------------------------------------------------
-- The keys are pseudonymous HMAC values. No raw email or IP address is stored.
-- Two independent scopes are used by the API:
--   PRINCIPAL: protects one account even when attempts come from many IPs;
--   IP: protects the service from one abusive network source.

CREATE TABLE auth_login_throttles (
  scope text NOT NULL CHECK (scope IN ('PRINCIPAL', 'IP')),
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX auth_login_throttles_blocked_idx
  ON auth_login_throttles(blocked_until)
  WHERE blocked_until IS NOT NULL;

COMMIT;
