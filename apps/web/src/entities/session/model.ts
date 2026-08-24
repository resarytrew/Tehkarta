export interface LoginMembership {
  workspaceId: string;
  role: string;
  permissions: readonly string[];
}

export interface LoginResponse {
  user: { id: string; email: string; displayName: string | null };
  memberships: LoginMembership[];
  csrfToken: string;
  expiresAt: string;
}

export interface MeResponse {
  user: { id: string; email: string; displayName: string | null };
  workspace: { id: string; role: string; permissions: readonly string[] };
}
