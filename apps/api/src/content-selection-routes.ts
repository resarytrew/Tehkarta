import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  SetLessonUmkContentDecision,
  type LessonContentContextRepository,
  type LessonContentSelectionRepository,
  type LessonInvalidationRepository,
  type LessonRepository
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  type AuthRuntime
} from './auth.js';

export interface ContentSelectionRouteDependencies {
  auth: AuthRuntime;
  lessons: LessonRepository;
  contentContext: LessonContentContextRepository;
  contentSelections: LessonContentSelectionRepository;
  invalidations: LessonInvalidationRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must be a positive integer.`);
  }
  return value;
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

export async function registerContentSelectionRoutes(
  app: FastifyInstance,
  dependencies: ContentSelectionRouteDependencies
): Promise<void> {
  const setUmkDecision = new SetLessonUmkContentDecision({
    lessons: dependencies.lessons,
    contentContext: dependencies.contentContext,
    selections: dependencies.contentSelections,
    invalidations: dependencies.invalidations,
    clock: dependencies.clock,
    ids: dependencies.ids
  });

  app.post<{
    Params: { lessonId: string; mappingId: string };
    Body: { decision?: unknown; expectedLessonVersion?: unknown };
  }>(
    '/api/v1/lessons/:lessonId/content-selection/umk/:mappingId',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:write');

      const decision = request.body?.decision;
      if (decision !== 'INCLUDED' && decision !== 'EXCLUDED') {
        throw new ApplicationError(
          'VALIDATION_FAILED',
          'decision must be INCLUDED or EXCLUDED.'
        );
      }

      const expectedLessonVersion = positiveInteger(
        request.body?.expectedLessonVersion,
        'expectedLessonVersion'
      );
      const result = await setUmkDecision.execute(context, {
        lessonId: request.params.lessonId,
        mappingId: request.params.mappingId,
        decision,
        expectedLessonVersion
      });

      return {
        data: result.lesson,
        contentContext: result.contentContext,
        selection: result.selection,
        invalidations: result.invalidations,
        changed: result.changed
      };
    }
  );
}
