import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  GetLessonContentContext,
  type LessonContentContextRepository
} from '@tehkarta/application';
import type { AuthorizationPolicy, RequestContext } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireWorkspacePrincipal,
  type AuthRuntime
} from './auth.js';

export interface ContentContextRouteDependencies {
  auth: AuthRuntime;
  contentContext: LessonContentContextRepository;
  authorization: AuthorizationPolicy;
}

async function requirePermission(
  authorization: AuthorizationPolicy,
  context: RequestContext,
  action: string
): Promise<void> {
  const allowed = await authorization.can(context, action, {
    type: 'lesson',
    workspaceId: context.workspaceId
  });
  if (!allowed) throw new ApplicationError('FORBIDDEN', `You do not have permission to ${action}.`);
}

export async function registerContentContextRoutes(
  app: FastifyInstance,
  dependencies: ContentContextRouteDependencies
): Promise<void> {
  const getContentContext = new GetLessonContentContext(dependencies.contentContext);

  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/content-context',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:read');
      return { data: await getContentContext.execute(context, request.params.lessonId) };
    }
  );
}
