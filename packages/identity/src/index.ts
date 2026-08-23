import type { Clock, IdGenerator, WorkspaceId } from '@tehkarta/ports';
import type { SessionTokenCodec } from './session-tokens.js';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface IdentityUser {
  id: string;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  status: UserStatus;
}

export interface WorkspaceMembership {
  workspaceId: WorkspaceId;
  userId: string;
  role: string;
  permissions: readonly string[];
  status: MembershipStatus;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfSecretHash: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  ipHash: string | null;
}

export interface NewSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfSecretHash: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ipHash?: string;
}

export interface IdentityRepository {
  getUserById(userId: string): Promise<IdentityUser | null>;
  getUserByNormalizedEmail(normalizedEmail: string): Promise<IdentityUser | null>;
  listMemberships(userId: string): Promise<WorkspaceMembership[]>;
  getMembership(userId: string, workspaceId: WorkspaceId): Promise<WorkspaceMembership | null>;
}

export interface SessionRepository {
  create(session: NewSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touch(sessionId: string, seenAt: string): Promise<void>;
  revoke(sessionId: string, revokedAt: string): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: string): Promise<number>;
}

export interface PasswordVerifier {
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface PasswordCredentialRepository {
  getPasswordHash(userId: string): Promise<string | null>;
}

export interface AuthenticatedWorkspacePrincipal {
  user: IdentityUser;
  membership: WorkspaceMembership;
  sessionId: string;
}

export interface IssuedSession {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
}

export class AuthenticationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'USER_INACTIVE'
      | 'SESSION_INVALID'
      | 'SESSION_EXPIRED'
      | 'WORKSPACE_FORBIDDEN'
      | 'CSRF_INVALID'
  ) {
    super(code);
    this.name = 'AuthenticationError';
  }
}

export interface SessionServiceDependencies {
  identities: IdentityRepository;
  sessions: SessionRepository;
  tokens: SessionTokenCodec;
  clock: Clock;
  ids: IdGenerator;
  touchIntervalMs?: number;
}

export class SessionService {
  private readonly touchIntervalMs: number;

  constructor(private readonly deps: SessionServiceDependencies) {
    this.touchIntervalMs = deps.touchIntervalMs ?? 5 * 60 * 1000;
  }

  async issueForUser(input: {
    userId: string;
    ttlSeconds: number;
    userAgent?: string;
    ipHash?: string;
  }): Promise<IssuedSession> {
    const user = await this.deps.identities.getUserById(input.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('USER_INACTIVE');
    }

    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000);
    const secrets = this.deps.tokens.issue();
    const sessionId = this.deps.ids.generate('ses');

    const record: NewSessionRecord = {
      id: sessionId,
      userId: user.id,
      tokenHash: secrets.sessionTokenHash,
      csrfSecretHash: secrets.csrfTokenHash,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    if (input.userAgent) record.userAgent = input.userAgent;
    if (input.ipHash) record.ipHash = input.ipHash;

    await this.deps.sessions.create(record);

    return {
      sessionId,
      sessionToken: secrets.sessionToken,
      csrfToken: secrets.csrfToken,
      expiresAt: record.expiresAt
    };
  }

  private async requireActiveSession(rawSessionToken: string): Promise<SessionRecord> {
    const tokenHash = this.deps.tokens.hashSessionToken(rawSessionToken);
    const session = await this.deps.sessions.findByTokenHash(tokenHash);
    if (!session || session.revokedAt) {
      throw new AuthenticationError('SESSION_INVALID');
    }

    if (new Date(session.expiresAt).getTime() <= this.deps.clock.now().getTime()) {
      throw new AuthenticationError('SESSION_EXPIRED');
    }

    return session;
  }

  async resolveWorkspace(
    rawSessionToken: string,
    workspaceId: WorkspaceId
  ): Promise<AuthenticatedWorkspacePrincipal> {
    const session = await this.requireActiveSession(rawSessionToken);
    const now = this.deps.clock.now();

    const user = await this.deps.identities.getUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('USER_INACTIVE');
    }

    const membership = await this.deps.identities.getMembership(user.id, workspaceId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AuthenticationError('WORKSPACE_FORBIDDEN');
    }

    const lastSeenMs = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
    if (now.getTime() - lastSeenMs >= this.touchIntervalMs) {
      await this.deps.sessions.touch(session.id, now.toISOString());
    }

    return { user, membership, sessionId: session.id };
  }

  async assertCsrf(rawSessionToken: string, rawCsrfToken: string): Promise<void> {
    const session = await this.requireActiveSession(rawSessionToken);
    if (
      !session.csrfSecretHash ||
      !this.deps.tokens.verifyCsrfToken(rawCsrfToken, session.csrfSecretHash)
    ) {
      throw new AuthenticationError('CSRF_INVALID');
    }
  }

  async revoke(rawSessionToken: string): Promise<void> {
    const tokenHash = this.deps.tokens.hashSessionToken(rawSessionToken);
    const session = await this.deps.sessions.findByTokenHash(tokenHash);
    if (!session || session.revokedAt) return;
    await this.deps.sessions.revoke(session.id, this.deps.clock.now().toISOString());
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

export * from './session-tokens.js';
