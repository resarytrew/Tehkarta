import type {
  IdentityRepository,
  IdentityUser,
  MembershipStatus,
  NewSessionRecord,
  SessionRecord,
  SessionRepository,
  UserStatus,
  WorkspaceMembership
} from '@tehkarta/identity';
import type { Pool } from 'pg';

interface UserRow {
  id: string;
  email: string;
  normalized_email: string;
  display_name: string | null;
  status: UserStatus;
}

interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: string;
  permissions: unknown;
  status: MembershipStatus;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_secret_hash: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
  user_agent: string | null;
  ip_hash: string | null;
}

function parsePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function mapUser(row: UserRow): IdentityUser {
  return {
    id: row.id,
    email: row.email,
    normalizedEmail: row.normalized_email,
    displayName: row.display_name,
    status: row.status
  };
}

function mapMembership(row: MembershipRow): WorkspaceMembership {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    permissions: parsePermissions(row.permissions),
    status: row.status
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfSecretHash: row.csrf_secret_hash,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    userAgent: row.user_agent,
    ipHash: row.ip_hash
  };
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async getUserById(userId: string): Promise<IdentityUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, normalized_email, display_name, status
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const row = result.rows[0];
    return row ? mapUser(row) : null;
  }

  async getUserByNormalizedEmail(normalizedEmail: string): Promise<IdentityUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, normalized_email, display_name, status
       FROM users
       WHERE normalized_email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );
    const row = result.rows[0];
    return row ? mapUser(row) : null;
  }

  async listMemberships(userId: string): Promise<WorkspaceMembership[]> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT workspace_id, user_id, role, permissions, status
       FROM workspace_memberships
       WHERE user_id = $1
       ORDER BY workspace_id`,
      [userId]
    );
    return result.rows.map(mapMembership);
  }

  async getMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT workspace_id, user_id, role, permissions, status
       FROM workspace_memberships
       WHERE user_id = $1 AND workspace_id = $2`,
      [userId, workspaceId]
    );
    const row = result.rows[0];
    return row ? mapMembership(row) : null;
  }
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(session: NewSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions(
         id, user_id, token_hash, csrf_secret_hash, created_at, expires_at,
         user_agent, ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.csrfSecretHash,
        new Date(session.createdAt),
        new Date(session.expiresAt),
        session.userAgent ?? null,
        session.ipHash ?? null
      ]
    );
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_id, token_hash, csrf_secret_hash, created_at, expires_at,
              revoked_at, last_seen_at, user_agent, ip_hash
       FROM sessions
       WHERE token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? mapSession(row) : null;
  }

  async touch(sessionId: string, seenAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET last_seen_at = $1
       WHERE id = $2 AND revoked_at IS NULL`,
      [new Date(seenAt), sessionId]
    );
  }

  async revoke(sessionId: string, revokedAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET revoked_at = COALESCE(revoked_at, $1)
       WHERE id = $2`,
      [new Date(revokedAt), sessionId]
    );
  }

  async revokeAllForUser(userId: string, revokedAt: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE sessions
       SET revoked_at = $1
       WHERE user_id = $2 AND revoked_at IS NULL`,
      [new Date(revokedAt), userId]
    );
    return result.rowCount ?? 0;
  }
}
