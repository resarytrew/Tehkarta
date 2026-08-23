import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import {
  Argon2idPasswordHasher,
  AuthenticationError,
  LoginThrottleService,
  NodeSessionTokenCodec,
  PasswordLoginService,
  SessionService
} from '@tehkarta/identity';
import type { Clock, IdGenerator } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import {
  PostgresIdentityRepository,
  PostgresPasswordCredentialRepository,
  PostgresSessionRepository
} from './repositories/identity.repository.js';
import { PostgresLoginThrottleRepository } from './repositories/login-throttle.repository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for auth smoke test.');

await migrateDatabase({ databaseUrl });

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const password = 'Tehkarta-Smoke-Password-2026!';
const passwordHasher = new Argon2idPasswordHasher();
const passwordHash = await passwordHasher.hash(password);
const dummyHash = await passwordHasher.hash('definitely-not-the-user-password');

const fixedNow = new Date('2026-08-23T17:00:00.000Z');
let currentNow = fixedNow;
const clock: Clock = { now: () => new Date(currentNow) };
let issuedId = 0;
const ids: IdGenerator = { generate: (prefix = 'id') => `${prefix}_auth_smoke_${++issuedId}` };

try {
  await pool.query(
    `INSERT INTO users(id, email, normalized_email, display_name)
     VALUES ('usr_auth_smoke', 'teacher@smoke.test', 'teacher@smoke.test', 'Auth Smoke Teacher');

     INSERT INTO workspaces(id, slug, name, created_by)
     VALUES ('ws_auth_smoke', 'auth-smoke', 'Auth smoke workspace', 'usr_auth_smoke');

     INSERT INTO workspace_memberships(workspace_id, user_id, role, permissions)
     VALUES (
       'ws_auth_smoke', 'usr_auth_smoke', 'OWNER',
       '["course:read","lesson:read","lesson:write"]'::jsonb
     );`
  );

  await pool.query(
    `INSERT INTO password_credentials(user_id, password_hash, algorithm)
     VALUES ('usr_auth_smoke', $1, 'argon2id')`,
    [passwordHash]
  );

  const credentialRow = await pool.query<{ password_hash: string; algorithm: string }>(
    `SELECT password_hash, algorithm
     FROM password_credentials
     WHERE user_id = 'usr_auth_smoke'`
  );
  if (
    credentialRow.rows[0]?.password_hash === password ||
    !credentialRow.rows[0]?.password_hash.startsWith('$argon2id$') ||
    credentialRow.rows[0]?.algorithm !== 'argon2id'
  ) {
    throw new Error('Password credential was not persisted as an Argon2id hash.');
  }

  const identities = new PostgresIdentityRepository(pool);
  const sessionRepository = new PostgresSessionRepository(pool);
  const sessions = new SessionService({
    identities,
    sessions: sessionRepository,
    tokens: new NodeSessionTokenCodec(),
    clock,
    ids
  });
  const throttle = new LoginThrottleService(new PostgresLoginThrottleRepository(pool), {
    principal: { maxFailures: 2, windowSeconds: 900, blockSeconds: 900 },
    ip: { maxFailures: 4, windowSeconds: 900, blockSeconds: 900 }
  });
  const login = new PasswordLoginService({
    identities,
    credentials: new PostgresPasswordCredentialRepository(pool),
    passwords: passwordHasher,
    sessions,
    throttle,
    clock,
    principalHasher: (normalizedEmail) =>
      createHmac('sha256', 'auth-smoke-principal-key')
        .update(normalizedEmail)
        .digest('hex'),
    dummyPasswordHash: dummyHash
  });

  const success = await login.login({
    email: 'Teacher@Smoke.Test',
    password,
    ttlSeconds: 3600,
    ipHash: 'ip_success'
  });
  if (
    success.user.id !== 'usr_auth_smoke' ||
    success.memberships[0]?.workspaceId !== 'ws_auth_smoke'
  ) {
    throw new Error('Password login did not restore the expected user/workspace.');
  }

  const storedSession = await sessionRepository.findByTokenHash(
    new NodeSessionTokenCodec().hashSessionToken(success.session.sessionToken)
  );
  if (!storedSession || storedSession.tokenHash === success.session.sessionToken) {
    throw new Error('Password login persisted a raw session token.');
  }

  async function expectInvalidCredentials(email: string, candidate: string, ipHash: string) {
    try {
      await login.login({
        email,
        password: candidate,
        ttlSeconds: 3600,
        ipHash
      });
    } catch (error: unknown) {
      if (error instanceof AuthenticationError && error.code === 'INVALID_CREDENTIALS') return;
      throw error;
    }
    throw new Error('Invalid password login unexpectedly succeeded.');
  }

  await expectInvalidCredentials('teacher@smoke.test', 'wrong-password', 'ip_wrong_once');
  await expectInvalidCredentials('unknown@smoke.test', 'wrong-password', 'ip_unknown_once');

  // Two failures for the same principal are enough to activate the deliberately
  // strict smoke-test policy. This verifies throttle state is shared in PostgreSQL.
  await expectInvalidCredentials('blocked@smoke.test', 'wrong-password', 'ip_block_1');
  let rateLimited = false;
  try {
    await login.login({
      email: 'blocked@smoke.test',
      password: 'wrong-password-again',
      ttlSeconds: 3600,
      ipHash: 'ip_block_2'
    });
  } catch (error: unknown) {
    rateLimited = error instanceof AuthenticationError && error.code === 'RATE_LIMITED';
  }
  if (!rateLimited) throw new Error('Persistent principal login throttle did not activate.');

  const throttleLeak = await pool.query(
    `SELECT 1
     FROM auth_login_throttles
     WHERE key_hash IN ('teacher@smoke.test', 'blocked@smoke.test', 'ip_block_1', 'ip_block_2')`
  );
  if (throttleLeak.rowCount) {
    throw new Error('Login throttle persisted a raw email or raw IP key.');
  }

  currentNow = new Date(fixedNow.getTime() + 60_000);
  await sessions.revoke(success.session.sessionToken);

  console.info('[database] password login + persistent throttle smoke test passed');
} finally {
  await pool.end();
}
