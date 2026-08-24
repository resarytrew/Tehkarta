import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  ApprovePedagogicalProfileDecision,
  ApprovePedagogicalTechnology,
  EditPedagogicalProfileDecision,
  ListPedagogicalTechnologies,
  type LessonInvalidationRepository,
  type LessonRepository,
  type PedagogicalProfileKey,
  type PedagogicalProfileValue
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext, Telemetry } from '@tehkarta/ports';
import { requestContextFromPrincipal, requireCsrf, requireWorkspacePrincipal, type AuthRuntime } from './auth.js';

interface Dependencies {
  auth: AuthRuntime;
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
  telemetry?: Telemetry;
}

function positiveInteger(value: unknown, name: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) throw new ApplicationError('VALIDATION_FAILED', `${name} must be an integer.`);
  return value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new ApplicationError('VALIDATION_FAILED', `${name} must be a non-empty string.`);
  return value.trim();
}

function profileKey(value: string): PedagogicalProfileKey {
  if (value === 'pedagogicalStyle' || value === 'communicationTone' || value === 'pedagogicalFocus') return value;
  throw new ApplicationError('VALIDATION_FAILED', `Unsupported pedagogical profile key: ${value}.`);
}

async function requireWrite(authorization: AuthorizationPolicy, context: RequestContext): Promise<void> {
  if (!await authorization.can(context, 'lesson:write', { type: 'lesson', workspaceId: context.workspaceId })) throw new ApplicationError('FORBIDDEN', 'You do not have permission to change lesson pedagogy.');
}

export async function registerPedagogyRoutes(app: FastifyInstance, dependencies: Dependencies): Promise<void> {
  const shared = { lessons: dependencies.lessons, invalidations: dependencies.invalidations, clock: dependencies.clock, ids: dependencies.ids, ...(dependencies.telemetry ? { telemetry:dependencies.telemetry } : {}) };
  const edit = new EditPedagogicalProfileDecision(shared);
  const approve = new ApprovePedagogicalProfileDecision(shared);
  const approveTechnology = new ApprovePedagogicalTechnology(shared);
  const listTechnologies = new ListPedagogicalTechnologies();

  app.patch<{ Params:{ lessonId:string; key:string }; Body:{ value?:unknown; expectedLessonVersion?:unknown; expectedFieldRevision?:unknown } }>('/api/v1/lessons/:lessonId/pedagogical-profile/:key', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requireWrite(dependencies.authorization, context);
    const expectedFieldRevision = request.body?.expectedFieldRevision;
    const result = await edit.execute(context, { lessonId:request.params.lessonId, key:profileKey(request.params.key), value:text(request.body?.value,'value') as PedagogicalProfileValue, expectedLessonVersion:positiveInteger(request.body?.expectedLessonVersion,'expectedLessonVersion'), ...(expectedFieldRevision !== undefined ? { expectedFieldRevision:positiveInteger(expectedFieldRevision,'expectedFieldRevision',true) } : {}) });
    return { data:result.lesson, invalidations:result.invalidations };
  });

  app.post<{ Params:{ lessonId:string; key:string }; Body:{ expectedLessonVersion?:unknown; expectedFieldRevision?:unknown } }>('/api/v1/lessons/:lessonId/pedagogical-profile/:key/approve', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requireWrite(dependencies.authorization, context);
    const result = await approve.execute(context, { lessonId:request.params.lessonId, key:profileKey(request.params.key), expectedLessonVersion:positiveInteger(request.body?.expectedLessonVersion,'expectedLessonVersion'), expectedFieldRevision:positiveInteger(request.body?.expectedFieldRevision,'expectedFieldRevision') });
    return { data:result.lesson, invalidations:result.invalidations };
  });

  app.get<{ Params:{ lessonId:string } }>('/api/v1/lessons/:lessonId/methodology/technologies', async (request) => {
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    if (!await dependencies.authorization.can(context, 'lesson:read', { type:'lesson', workspaceId:context.workspaceId })) throw new ApplicationError('FORBIDDEN','You do not have permission to read lesson pedagogy.');
    if (!await dependencies.lessons.getById(context, request.params.lessonId)) throw new ApplicationError('NOT_FOUND',`Lesson ${request.params.lessonId} was not found.`);
    return { data:listTechnologies.execute() };
  });

  app.post<{ Params:{ lessonId:string }; Body:{ technologyId?:unknown; packId?:unknown; packVersion?:unknown; expectedLessonVersion?:unknown; expectedFieldRevision?:unknown } }>('/api/v1/lessons/:lessonId/methodology/technology', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requireWrite(dependencies.authorization, context);
    const expectedFieldRevision = request.body?.expectedFieldRevision;
    const result = await approveTechnology.execute(context, { lessonId:request.params.lessonId, technologyId:text(request.body?.technologyId,'technologyId'), packId:text(request.body?.packId,'packId'), packVersion:text(request.body?.packVersion,'packVersion'), expectedLessonVersion:positiveInteger(request.body?.expectedLessonVersion,'expectedLessonVersion'), ...(expectedFieldRevision !== undefined ? { expectedFieldRevision:positiveInteger(expectedFieldRevision,'expectedFieldRevision',true) } : {}) });
    return { data:result.lesson, invalidations:result.invalidations };
  });
}
