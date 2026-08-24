import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  BuildApprovedScenarioContext,
  SaveLessonDesignArtifact,
  type CourseRepository,
  type CoursePlanningRepository,
  type LessonContentContextRepository,
  type LessonDesignArtifactKind,
  type LessonDesignArtifactRepository,
  type LessonRepository
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext, Telemetry } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  type AuthRuntime
} from './auth.js';

interface Dependencies {
  auth: AuthRuntime;
  courses: CourseRepository;
  coursePlanning?: CoursePlanningRepository;
  lessons: LessonRepository;
  contentContext: LessonContentContextRepository;
  artifacts: LessonDesignArtifactRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
  telemetry?: Telemetry;
}

function artifactKind(value: string): LessonDesignArtifactKind {
  const normalized = value.toUpperCase();
  if (normalized === 'SCENARIO' || normalized === 'MATERIALS') return normalized;
  throw new ApplicationError('VALIDATION_FAILED', `Unsupported artifact kind: ${value}.`);
}

function positiveInteger(value: unknown, field: string, allowZero = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < (allowZero ? 0 : 1)
  ) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be an integer.`);
  }
  return value;
}

function payload(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('VALIDATION_FAILED', 'payload must be a JSON object.');
  }
  return value as Readonly<Record<string, unknown>>;
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

export async function registerLessonWorkflowRoutes(
  app: FastifyInstance,
  dependencies: Dependencies
): Promise<void> {
  const scenarioContext = new BuildApprovedScenarioContext(dependencies);
  const saveArtifact = new SaveLessonDesignArtifact({
    lessons: dependencies.lessons,
    artifacts: dependencies.artifacts,
    buildApprovedContext: (context, lessonId) => scenarioContext.execute(context, lessonId),
    now: () => dependencies.clock.now(),
    generateId: (prefix) => dependencies.ids.generate(prefix),
    ...(dependencies.telemetry ? { telemetry: dependencies.telemetry } : {})
  });

  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/scenario-context',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:read');
      return { data: await scenarioContext.execute(context, request.params.lessonId) };
    }
  );

  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/design-artifacts',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:read');
      return { data: await dependencies.artifacts.list(context, request.params.lessonId) };
    }
  );

  app.put<{
    Params: { lessonId: string; kind: string };
    Body: { expectedLessonVersion?: unknown; expectedRevision?: unknown; payload?: unknown };
  }>('/api/v1/lessons/:lessonId/design-artifacts/:kind', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:write');
    return {
      data: await saveArtifact.execute(context, {
        lessonId: request.params.lessonId,
        kind: artifactKind(request.params.kind),
        expectedLessonVersion: positiveInteger(
          request.body?.expectedLessonVersion,
          'expectedLessonVersion'
        ),
        expectedRevision: positiveInteger(
          request.body?.expectedRevision,
          'expectedRevision',
          true
        ),
        payload: payload(request.body?.payload)
      })
    };
  });
}
