import type { AuthorizationPolicy, RequestContext, UserId, WorkspaceId } from '@tehkarta/ports';

export class WorkspaceAuthorizationPolicy implements AuthorizationPolicy {
  can(
    context: RequestContext,
    action: string,
    resource: { type: string; workspaceId: WorkspaceId; ownerUserId?: UserId }
  ): boolean {
    if (resource.workspaceId !== context.workspaceId) return false;

    if (context.roles.some((role) => role === 'OWNER' || role === 'ADMIN')) {
      return true;
    }

    if (context.permissions.includes('*') || context.permissions.includes(action)) {
      return true;
    }

    if (resource.ownerUserId && resource.ownerUserId === context.actorUserId) {
      return context.permissions.includes(`${resource.type}:own`);
    }

    return false;
  }
}
