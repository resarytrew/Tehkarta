import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AddCourseSource,
  ApplicationError,
  ApproveCoursePlan,
  ApproveCourseSource,
  SaveCoursePlanDraft,
  type CourseLessonProgression,
  type CoursePlanningRepository,
  type CourseSourceRole,
  type LessonProgressStatus
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  type AuthRuntime
} from './auth.js';
import { extractDocumentText, normalizedDocumentMimeType } from './document-extraction.js';

interface Dependencies {
  auth: AuthRuntime;
  planning: CoursePlanningRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ApplicationError('VALIDATION_FAILED', `${field} must be a string.`);
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be an array of strings.`);
  }
  return value as string[];
}

function integer(value: unknown, field: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be an integer.`);
  }
  return value;
}

function progressStatus(value: unknown): LessonProgressStatus {
  if (value === 'PLANNED' || value === 'TAUGHT' || value === 'ASSESSED') return value;
  throw new ApplicationError('VALIDATION_FAILED', 'Unsupported progressStatus.');
}

function sourceRole(value: unknown): CourseSourceRole {
  if (
    value === 'WORKING_PROGRAM' || value === 'TEXTBOOK' || value === 'METHOD_GUIDE' ||
    value === 'ATLAS' || value === 'WORKBOOK' || value === 'ASSESSMENT' || value === 'OTHER'
  ) return value;
  throw new ApplicationError('VALIDATION_FAILED', 'Unsupported sourceRole.');
}

function lessonProgressions(value: unknown): CourseLessonProgression[] {
  if (!Array.isArray(value)) throw new ApplicationError('VALIDATION_FAILED', 'lessons must be an array.');
  return value.map((raw, index) => {
    const item = record(raw, `lessons[${index}]`);
    return {
      lessonId: stringValue(item.lessonId, `lessons[${index}].lessonId`),
      position: integer(item.position, `lessons[${index}].position`),
      topic: stringValue(item.topic, `lessons[${index}].topic`),
      contentSummary: stringValue(item.contentSummary, `lessons[${index}].contentSummary`),
      concepts: stringList(item.concepts, `lessons[${index}].concepts`),
      dates: stringList(item.dates, `lessons[${index}].dates`),
      personalities: stringList(item.personalities, `lessons[${index}].personalities`),
      expectedOutcomes: stringList(item.expectedOutcomes, `lessons[${index}].expectedOutcomes`),
      progressStatus: progressStatus(item.progressStatus)
    };
  });
}

async function requirePermission(
  authorization: AuthorizationPolicy,
  context: RequestContext,
  action: string
): Promise<void> {
  const allowed = await authorization.can(context, action, {
    type: 'course',
    workspaceId: context.workspaceId
  });
  if (!allowed) throw new ApplicationError('FORBIDDEN', `You do not have permission to ${action}.`);
}

export async function registerCoursePlanningRoutes(
  app: FastifyInstance,
  dependencies: Dependencies
): Promise<void> {
  const save = new SaveCoursePlanDraft(dependencies);
  const approve = new ApproveCoursePlan(dependencies);
  const addSource = new AddCourseSource(dependencies);
  const approveSource = new ApproveCourseSource(dependencies);

  app.get<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/planning-context',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:read');
      return { data: await dependencies.planning.getSnapshot(context, request.params.courseId) };
    }
  );

  app.put<{ Params: { courseId: string }; Body: unknown }>(
    '/api/v1/courses/:courseId/plan',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:write');
      const body = record(request.body, 'body');
      return {
        data: await save.execute(context, request.params.courseId, {
          expectedRevision: integer(body.expectedRevision, 'expectedRevision', true),
          goals: stringList(body.goals, 'goals'),
          plannedOutcomes: stringList(body.plannedOutcomes, 'plannedOutcomes'),
          contentSummary: stringValue(body.contentSummary, 'contentSummary'),
          lessons: lessonProgressions(body.lessons)
        })
      };
    }
  );

  app.post<{ Params: { courseId: string }; Body: unknown }>(
    '/api/v1/courses/:courseId/plan/approve',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:write');
      const body = record(request.body, 'body');
      return {
        data: await approve.execute(
          context,
          request.params.courseId,
          integer(body.expectedRevision, 'expectedRevision')
        )
      };
    }
  );

  app.post<{
    Params: { courseId: string };
    Querystring: { title?: string; sourceRole?: string; rightsBasis?: string };
  }>(
    '/api/v1/courses/:courseId/sources',
    { bodyLimit: 10_485_760 },
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:write');
      const file = await request.file({ limits: { files: 1, fileSize: 10_485_760 } });
      if (!file) throw new ApplicationError('VALIDATION_FAILED', 'Document file is required.');
      const bytes = new Uint8Array(await file.toBuffer());
      const mimeType = normalizedDocumentMimeType(file.mimetype, file.filename);
      const extracted = await extractDocumentText(bytes, mimeType);
      return {
        data: await addSource.execute(context, request.params.courseId, {
          title: request.query.title?.trim() || file.filename,
          sourceRole: sourceRole(request.query.sourceRole),
          mimeType,
          rightsBasis: request.query.rightsBasis?.trim() || 'TEACHER_PROVIDED_FOR_EDUCATIONAL_USE',
          checksumSha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
          ...(extracted.pageCount !== undefined ? { pageCount: extracted.pageCount } : {}),
          extractedText: extracted.text
        })
      };
    }
  );

  app.post<{ Params: { courseId: string; bindingId: string } }>(
    '/api/v1/courses/:courseId/sources/:bindingId/approve',
    async (request) => {
      await requireCsrf(request, dependencies.auth);
      const principal = await requireWorkspacePrincipal(request, dependencies.auth);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:write');
      return {
        data: await approveSource.execute(
          context,
          request.params.courseId,
          request.params.bindingId
        )
      };
    }
  );
}
