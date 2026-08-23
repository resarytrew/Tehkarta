import type { Clock } from '@tehkarta/ports';
import type {
  IdentityUser,
  PasswordCredentialRepository,
  SessionService,
  WorkspaceMembership
} from './index.js';
import { AuthenticationError, normalizeEmail } from './index.js';
import type { LoginThrottleService } from './login-throttle.js';
import type { PasswordVerifier } from './index.js';

export interface PasswordLoginDependencies {
  identities: {
    getUserByNormalizedEmail(normalizedEmail: string): Promise<IdentityUser | null>;
    listMemberships(userId: string): Promise<WorkspaceMembership[]>;
  };
  credentials: PasswordCredentialRepository;
  passwords: PasswordVerifier;
  sessions: SessionService;
  throttle: LoginThrottleService;
  clock: Clock;
  dummyPasswordHash: string;
}

export interface PasswordLoginInput {
  email: string;
  password: string;
  ttlSeconds: number;
  principalHash: string;
  ipHash: string;
  userAgent?: string;
}

export interface PasswordLoginResult {
  user: IdentityUser;
  memberships: WorkspaceMembership[];
  session: Awaited<ReturnType<SessionService['issueForUser']>>;
}

/**
 * Password authentication deliberately returns the same INVALID_CREDENTIALS
 * outcome for an unknown email, missing password credential, invalid password,
 * or inactive account. This prevents the login endpoint becoming an account
 * enumeration oracle.
 *
 * Expensive Argon2 verification is guarded by a persistent two-scope throttle,
 * so horizontally scaled serverless instances share the same abuse state.
 */
export class PasswordLoginService {
  constructor(private readonly deps: PasswordLoginDependencies) {}

  async login(input: PasswordLoginInput): Promise<PasswordLoginResult> {
    const now = this.deps.clock.now();
    const throttleKeys = {
      principalHash: input.principalHash,
      ipHash: input.ipHash
    };
    await this.deps.throttle.assertAllowed(throttleKeys, now);

    const normalizedEmail = normalizeEmail(input.email);
    const user = normalizedEmail
      ? await this.deps.identities.getUserByNormalizedEmail(normalizedEmail)
      : null;
    const storedHash = user ? await this.deps.credentials.getPasswordHash(user.id) : null;

    // Always execute one Argon2 verification, even for an unknown account.
    const verified = await this.deps.passwords.verify(
      storedHash ?? this.deps.dummyPasswordHash,
      input.password
    );

    if (!user || user.status !== 'ACTIVE' || !storedHash || !verified) {
      await this.deps.throttle.recordFailure(throttleKeys, this.deps.clock.now());
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }

    await this.deps.throttle.recordSuccess(throttleKeys);

    const memberships = (await this.deps.identities.listMemberships(user.id)).filter(
      (membership) => membership.status === 'ACTIVE'
    );

    const sessionInput: {
      userId: string;
      ttlSeconds: number;
      userAgent?: string;
      ipHash?: string;
    } = {
      userId: user.id,
      ttlSeconds: input.ttlSeconds,
      ipHash: input.ipHash
    };
    if (input.userAgent) sessionInput.userAgent = input.userAgent;

    const session = await this.deps.sessions.issueForUser(sessionInput);
    return { user, memberships, session };
  }
}
