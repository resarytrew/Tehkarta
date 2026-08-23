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
  principalHasher(normalizedEmail: string): string;
  dummyPasswordHash: string;
}

export interface PasswordLoginInput {
  email: string;
  password: string;
  ttlSeconds: number;
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
 * so horizontally scaled serverless instances share the same abuse state. The
 * repository receives only keyed hashes, never a raw email address or IP.
 */
export class PasswordLoginService {
  constructor(private readonly deps: PasswordLoginDependencies) {}

  async login(input: PasswordLoginInput): Promise<PasswordLoginResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const now = this.deps.clock.now();
    const throttleKeys = {
      principalHash: this.deps.principalHasher(normalizedEmail),
      ipHash: input.ipHash
    };
    await this.deps.throttle.assertAllowed(throttleKeys, now);

    const user = normalizedEmail
      ? await this.deps.identities.getUserByNormalizedEmail(normalizedEmail)
      : null;

    // Always execute the password-credential query as well as one Argon2 check.
    // A missing account therefore follows nearly the same expensive path as a
    // known account with the wrong password.
    const storedHash = await this.deps.credentials.getPasswordHash(user?.id ?? '__missing_user__');
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
