import { randomUUID } from 'node:crypto';
import {
  createPostgresPool,
  databaseConfigFromEnv,
  PostgresCourseRepository,
  PostgresIdentityRepository,
  PostgresLessonAiProposalRepository,
  PostgresLessonInvalidationRepository,
  PostgresLessonRepository,
  PostgresLoginThrottleRepository,
  PostgresPasswordCredentialRepository,
  PostgresSessionRepository
} from '@tehkarta/database';
import {
  Argon2idPasswordHasher,
  LoginThrottleService,
  NodeSessionTokenCodec,
  PasswordLoginService,
  SessionService,
  WorkspaceAuthorizationPolicy
} from '@tehkarta/identity';
import type { Clock, IdGenerator } from '@tehkarta/ports';
import { createApiApp } from './app.js';
import { loadApiConfig } from './config.js';
import { hashLoginPrincipal } from './security.js';

const config = loadApiConfig();
const pool = createPostgresPool(databaseConfigFromEnv());

await pool.query('SELECT 1');

const clock: Clock = {
  now: () => new Date()
};

const ids: IdGenerator = {
  generate: (prefix = 'id') => `${prefix}_${randomUUID()}`
};

const identities = new PostgresIdentityRepository(pool);
const sessionRepository = new PostgresSessionRepository(pool);
const sessions = new SessionService({
  identities,
  sessions: sessionRepository,
  tokens: new NodeSessionTokenCodec(),
  clock,
  ids
});

const passwordHasher = new Argon2idPasswordHasher();
// Unknown-account logins still perform a real Argon2id verification to reduce
// timing differences that could otherwise expose whether an email is registered.
const dummyPasswordHash = await passwordHasher.hash(`tehkarta-dummy-${randomUUID()}`);
const loginThrottle = new LoginThrottleService(new PostgresLoginThrottleRepository(pool));
const passwordLogin = new PasswordLoginService({
  identities,
  credentials: new PostgresPasswordCredentialRepository(pool),
  passwords: passwordHasher,
  sessions,
  throttle: loginThrottle,
  clock,
  principalHasher: (normalizedEmail) =>
    hashLoginPrincipal(normalizedEmail, config.authIpHashKey),
  dummyPasswordHash
});

const app = await createApiApp(config, {
  sessions,
  passwordLogin,
  courses: new PostgresCourseRepository(pool),
  lessons: new PostgresLessonRepository(pool),
  invalidations: new PostgresLessonInvalidationRepository(pool),
  proposals: new PostgresLessonAiProposalRepository(pool),
  authorization: new WorkspaceAuthorizationPolicy(),
  clock,
  ids
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'graceful shutdown started');

  const forceExit = setTimeout(() => {
    app.log.error('graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await app.close();
    await pool.end();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'graceful shutdown failed');
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error({ err: error }, 'API startup failed');
  await pool.end();
  process.exitCode = 1;
}
