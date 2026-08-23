import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionService, AuthenticatedWorkspacePrincipal } from '@tehkarta/identity';
import { AuthenticationError } from '@tehkarta/identity';
import type { RequestContext } from '@tehkarta/ports';

export interface AuthRuntime {
  sessions: SessionService;
  sessionCookieName: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function workspaceIdFromRequest(request: FastifyRequest): string {
  const workspaceId = headerValue(request.headers['x-workspace-id']);
  if (!workspaceId) {
    throw new AuthenticationError('WORKSPACE_FORBIDDEN');
  }
  return workspaceId;
}

export function sessionTokenFromRequest(
  request: FastifyRequest,
  cookieName: string
): string {
  const token = request.cookies[cookieName];
  if (!token) {
    throw new AuthenticationError('SESSION_INVALID');
  }
  return token;
}

export async function requireWorkspacePrincipal(
  request: FastifyRequest,
  runtime: AuthRuntime
): Promise<AuthenticatedWorkspacePrincipal> {
  const workspaceId = workspaceIdFromRequest(request);
  const sessionToken = sessionTokenFromRequest(request, runtime.sessionCookieName);
  return runtime.sessions.resolveWorkspace(sessionToken, workspaceId);
}

export async function requireCsrf(
  request: FastifyRequest,
  runtime: AuthRuntime
): Promise<void> {
  const sessionToken = sessionTokenFromRequest(request, runtime.sessionCookieName);
  const csrfToken = headerValue(request.headers['x-csrf-token']);
  if (!csrfToken) {
    throw new AuthenticationError('CSRF_INVALID');
  }
  await runtime.sessions.assertCsrf(sessionToken, csrfToken);
}

export function requestContextFromPrincipal(
  request: FastifyRequest,
  principal: AuthenticatedWorkspacePrincipal
): RequestContext {
  return {
    requestId: request.id,
    workspaceId: principal.membership.workspaceId,
    actorUserId: principal.user.id,
    roles: [principal.membership.role],
    permissions: [...principal.membership.permissions]
  };
}

export function sendAuthenticationError(
  reply: FastifyReply,
  error: AuthenticationError
): FastifyReply {
  switch (error.code) {
    case 'WORKSPACE_FORBIDDEN':
      return reply.code(403).send({
        error: 'forbidden',
        code: error.code
      });
    case 'CSRF_INVALID':
      return reply.code(403).send({
        error: 'csrf_invalid',
        code: error.code
      });
    case 'USER_INACTIVE':
      return reply.code(403).send({
        error: 'user_inactive',
        code: error.code
      });
    case 'INVALID_CREDENTIALS':
    case 'SESSION_INVALID':
    case 'SESSION_EXPIRED':
      return reply.code(401).send({
        error: 'unauthorized',
        code: error.code
      });
  }
}
