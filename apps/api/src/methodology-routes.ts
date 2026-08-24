import type { FastifyInstance } from 'fastify';
import {
  AddApprovedLessonOutcome,
  ApplicationError,
  ApplyMethodologyRecommendation,
  ListMethodologyRecommendations,
  RejectMethodologyRecommendation,
  type LessonInvalidationRepository,
  type LessonRepository,
  type MethodologyFeedbackRepository,
  type CoursePlanningRepository
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext, Telemetry } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  type AuthRuntime
} from './auth.js';

export interface MethodologyRouteDependencies {
  auth: AuthRuntime;
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  feedback: MethodologyFeedbackRepository;
  planning?: CoursePlanningRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
  telemetry?: Telemetry;
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must be a positive integer.`);
  }
  return value;
}

function nonEmptyId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 300) {
    throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must contain between 1 and 300 characters.`);
  }
  return normalized;
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

export async function registerMethodologyRoutes(
  app: FastifyInstance,
  dependencies: MethodologyRouteDependencies
): Promise<void> {
  const list = new ListMethodologyRecommendations(
    dependencies.lessons,
    dependencies.feedback,
    undefined,
    dependencies.planning,
    dependencies.telemetry
  );
  const addOutcome = new AddApprovedLessonOutcome({
    lessons: dependencies.lessons,
    invalidations: dependencies.invalidations,
    clock: dependencies.clock,
    ids: dependencies.ids
  });
  const apply = new ApplyMethodologyRecommendation({
    lessons: dependencies.lessons,
    invalidations: dependencies.invalidations,
    clock: dependencies.clock,
    ids: dependencies.ids,
    ...(dependencies.planning ? { planning: dependencies.planning } : {}),
    ...(dependencies.telemetry ? { telemetry: dependencies.telemetry } : {})
  });
  const reject = new RejectMethodologyRecommendation({
    lessons: dependencies.lessons,
    feedback: dependencies.feedback,
    clock: dependencies.clock,
    ...(dependencies.planning ? { planning: dependencies.planning } : {}),
    ...(dependencies.telemetry ? { telemetry: dependencies.telemetry } : {})
  });

  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/methodology/recommendations',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:read');
      return { data: await list.execute(context, request.params.lessonId) };
    }
  );

  app.post<{
    Params: { lessonId: string };
    Body: { value?: unknown; expectedLessonVersion?: unknown };
  }>('/api/v1/lessons/:lessonId/outcomes', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:write');
    const value = typeof request.body?.value === 'string' ? request.body.value : '';
    const result = await addOutcome.execute(context, {
      lessonId: request.params.lessonId,
      value,
      expectedLessonVersion: positiveInteger(request.body?.expectedLessonVersion, 'expectedLessonVersion')
    });
    return { data: result.lesson, invalidations: result.invalidations };
  });

  app.post<{
    Params: { lessonId: string; recommendationId: string };
    Body: { expectedLessonVersion?: unknown; methodId?: unknown; formId?: unknown; techniqueIds?: unknown };
  }>(
    '/api/v1/lessons/:lessonId/methodology/recommendations/:recommendationId/use',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:write');
      const techniqueIds = request.body?.techniqueIds;
      if (techniqueIds !== undefined && (!Array.isArray(techniqueIds) || techniqueIds.some((id) => typeof id !== 'string'))) {
        throw new ApplicationError('VALIDATION_FAILED', 'techniqueIds must be an array of strings.');
      }
      const result = await apply.execute(context, {
        lessonId: request.params.lessonId,
        recommendationId: nonEmptyId(request.params.recommendationId, 'recommendationId'),
        methodId: nonEmptyId(request.body?.methodId, 'methodId'),
        formId: nonEmptyId(request.body?.formId, 'formId'),
        expectedLessonVersion: positiveInteger(request.body?.expectedLessonVersion, 'expectedLessonVersion'),
        ...(techniqueIds !== undefined ? { techniqueIds: techniqueIds as string[] } : {})
      });
      return { data: result.lesson, invalidations: result.invalidations };
    }
  );

  app.post<{
    Params: { lessonId: string; recommendationId: string };
  }>(
    '/api/v1/lessons/:lessonId/methodology/recommendations/:recommendationId/reject',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:write');
      await reject.execute(context, {
        lessonId: request.params.lessonId,
        recommendationId: nonEmptyId(request.params.recommendationId, 'recommendationId')
      });
      return { accepted: true };
    }
  );
}
