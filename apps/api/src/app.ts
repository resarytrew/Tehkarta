import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ApplicationError,
  ApproveCoreLessonDecision,
  EditCoreLessonDecision,
  type CoreLessonDecisionKey,
  type CourseRepository,
  type LessonAiProposalApplicationRepository,
  type LessonAiProposalRepository,
  type LessonInvalidationRepository,
  type LessonRepository
} from '@tehkarta/application';
import {
  AuthenticationError,
  type PasswordLoginService,
  type SessionService
} from '@tehkarta/identity';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { registerAiProposalRoutes } from './ai-proposal-routes.js';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  sendAuthenticationError,
  sessionTokenFromRequest
} from './auth.js';
import type { ApiConfig } from './config.js';
import { hashClientIp } from './security.js';

export interface ApiDependencies {
  sessions: SessionService;
  passwordLogin: PasswordLoginService;
  courses: CourseRepository;
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  proposals: LessonAiProposalRepository;
  proposalApplication: LessonAiProposalApplicationRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
}

function applicationErrorStatus(code: ApplicationError['code']): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'CONFLICT':
    case 'STALE_VERSION':
    case 'DEPENDENCY_STALE':
      return 409;
    case 'VALIDATION_FAILED':
      return 422;
    case 'EXTERNAL_SERVICE_FAILED':
      return 502;
  }
}

function parseCoreDecisionKey(value: string): CoreLessonDecisionKey {
  if (value === 'goal' || value === 'problemQuestion' || value === 'bigIdea') return value;
  throw new ApplicationError(
    'VALIDATION_FAILED',
    `Unsupported governed decision key: ${value}.`,
    { allowed: ['goal', 'problemQuestion', 'bigIdea'] }
  );
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must be a positive integer.`);
  }
  return value;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function requirePermission(
  authorization: AuthorizationPolicy,
  context: RequestContext,
  action: string,
  resourceType: string
): Promise<void> {
  const allowed = await authorization.can(context, action, {
    type: resourceType,
    workspaceId: context.workspaceId
  });
  if (!allowed) {
    throw new ApplicationError('FORBIDDEN', `You do not have permission to ${action}.`);
  }
}

export async function createApiApp(
  config: ApiConfig,
  dependencies: ApiDependencies
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id',
    trustProxy: config.trustProxy
  });

  const authRuntime = {
    sessions: dependencies.sessions,
    sessionCookieName: config.sessionCookieName
  };
  const governanceDependencies = {
    lessons: dependencies.lessons,
    invalidations: dependencies.invalidations,
    clock: dependencies.clock,
    ids: dependencies.ids
  };
  const editCoreDecision = new EditCoreLessonDecision(governanceDependencies);
  const approveCoreDecision = new ApproveCoreLessonDecision(governanceDependencies);

  await app.register(helmet, {
    contentSecurityPolicy: false
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
    allowedHeaders: ['content-type', 'x-request-id', 'x-workspace-id', 'x-csrf-token'],
    exposedHeaders: ['x-request-id']
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    if (error instanceof AuthenticationError) {
      return sendAuthenticationError(reply, error);
    }

    if (error instanceof ApplicationError) {
      return reply.code(applicationErrorStatus(error.code)).send({
        error: error.code.toLowerCase(),
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        requestId: request.id
      });
    }

    return reply.code(500).send({
      error: 'internal_error',
      requestId: request.id
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'tehkarta-api',
    version: '0.1.0'
  }));

  app.get('/api/v1/platform', async () => ({
    product: 'Tehkarta',
    architecture: 'course-section-lesson',
    principle: 'AI proposes, teacher decides'
  }));

  app.post<{
    Body: { email?: unknown; password?: unknown };
  }>('/api/v1/auth/login', async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    // Keep malformed and unknown credentials indistinguishable to the caller.
    if (!email || email.length > 254 || !password || password.length > 4096) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }

    const userAgent = singleHeader(request.headers['user-agent'])?.slice(0, 512);
    const result = await dependencies.passwordLogin.login({
      email,
      password,
      ttlSeconds: config.sessionTtlSeconds,
      ...(userAgent ? { userAgent } : {}),
      ipHash: hashClientIp(request.ip, config.authIpHashKey)
    });

    reply.setCookie(config.sessionCookieName, result.session.sessionToken, {
      path: '/',
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      maxAge: config.sessionTtlSeconds
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName
      },
      memberships: result.memberships.map((membership) => ({
        workspaceId: membership.workspaceId,
        role: membership.role,
        permissions: membership.permissions
      })),
      csrfToken: result.session.csrfToken,
      expiresAt: result.session.expiresAt
    };
  });

  app.get('/api/v1/me', async (request) => {
    const principal = await requireWorkspacePrincipal(request, authRuntime);

    return {
      user: {
        id: principal.user.id,
        email: principal.user.email,
        displayName: principal.user.displayName
      },
      workspace: {
        id: principal.membership.workspaceId,
        role: principal.membership.role,
        permissions: principal.membership.permissions
      }
    };
  });

  app.get('/api/v1/courses', async (request) => {
    const principal = await requireWorkspacePrincipal(request, authRuntime);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'course:read', 'course');

    return { data: await dependencies.courses.listSummaries(context) };
  });

  app.get<{ Params: { courseId: string } }>('/api/v1/courses/:courseId', async (request) => {
    const principal = await requireWorkspacePrincipal(request, authRuntime);
    const context = requestContextFromPrincipal(request, principal);

    const course = await dependencies.courses.getById(context, request.params.courseId);
    if (!course) {
      throw new ApplicationError('NOT_FOUND', `Course ${request.params.courseId} was not found.`);
    }

    const allowed = await dependencies.authorization.can(context, 'course:read', {
      type: 'course',
      workspaceId: course.workspaceId
    });
    if (!allowed) {
      throw new ApplicationError('FORBIDDEN', 'You do not have permission to read this course.');
    }

    return { data: course };
  });

  app.get<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/lessons',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, authRuntime);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'course:read', 'course');

      const course = await dependencies.courses.getById(context, request.params.courseId);
      if (!course) {
        throw new ApplicationError('NOT_FOUND', `Course ${request.params.courseId} was not found.`);
      }

      return {
        data: await dependencies.lessons.listSummariesByCourse(context, course.id)
      };
    }
  );

  app.get<{ Params: { lessonId: string } }>('/api/v1/lessons/:lessonId', async (request) => {
    const principal = await requireWorkspacePrincipal(request, authRuntime);
    const context = requestContextFromPrincipal(request, principal);

    const lesson = await dependencies.lessons.getById(context, request.params.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${request.params.lessonId} was not found.`);
    }

    const allowed = await dependencies.authorization.can(context, 'lesson:read', {
      type: 'lesson',
      workspaceId: lesson.workspaceId
    });
    if (!allowed) {
      throw new ApplicationError('FORBIDDEN', 'You do not have permission to read this lesson.');
    }

    return { data: lesson };
  });

  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/invalidations',
    async (request) => {
      const principal = await requireWorkspacePrincipal(request, authRuntime);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:read', 'lesson');

      const lesson = await dependencies.lessons.getById(context, request.params.lessonId);
      if (!lesson) {
        throw new ApplicationError('NOT_FOUND', `Lesson ${request.params.lessonId} was not found.`);
      }

      return {
        data: await dependencies.invalidations.listOpen(context, lesson.id)
      };
    }
  );

  app.patch<{
    Params: { lessonId: string; semanticKey: string };
    Body: {
      value: string;
      expectedLessonVersion: number;
      expectedFieldRevision?: number;
    };
  }>(
    '/api/v1/lessons/:lessonId/decisions/:semanticKey',
    async (request) => {
      await requireCsrf(request, authRuntime);
      const principal = await requireWorkspacePrincipal(request, authRuntime);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:write', 'lesson');

      if (!request.body || typeof request.body.value !== 'string') {
        throw new ApplicationError('VALIDATION_FAILED', 'value must be a string.');
      }

      const expectedLessonVersion = positiveInteger(
        request.body.expectedLessonVersion,
        'expectedLessonVersion'
      );
      const semanticKey = parseCoreDecisionKey(request.params.semanticKey);
      const expectedFieldRevision = request.body.expectedFieldRevision;
      if (expectedFieldRevision !== undefined) {
        positiveInteger(expectedFieldRevision, 'expectedFieldRevision');
      }

      const command = {
        lessonId: request.params.lessonId,
        semanticKey,
        value: request.body.value,
        expectedLessonVersion,
        ...(expectedFieldRevision !== undefined ? { expectedFieldRevision } : {})
      };
      const result = await editCoreDecision.execute(context, command);

      return {
        data: result.lesson,
        invalidations: result.invalidations
      };
    }
  );

  app.post<{
    Params: { lessonId: string; semanticKey: string };
    Body: {
      expectedLessonVersion: number;
      expectedFieldRevision: number;
    };
  }>(
    '/api/v1/lessons/:lessonId/decisions/:semanticKey/approve',
    async (request) => {
      await requireCsrf(request, authRuntime);
      const principal = await requireWorkspacePrincipal(request, authRuntime);
      const context = requestContextFromPrincipal(request, principal);
      await requirePermission(dependencies.authorization, context, 'lesson:write', 'lesson');

      if (!request.body) {
        throw new ApplicationError('VALIDATION_FAILED', 'Request body is required.');
      }

      const semanticKey = parseCoreDecisionKey(request.params.semanticKey);
      const expectedLessonVersion = positiveInteger(
        request.body.expectedLessonVersion,
        'expectedLessonVersion'
      );
      const expectedFieldRevision = positiveInteger(
        request.body.expectedFieldRevision,
        'expectedFieldRevision'
      );
      const result = await approveCoreDecision.execute(context, {
        lessonId: request.params.lessonId,
        semanticKey,
        expectedLessonVersion,
        expectedFieldRevision
      });

      return {
        data: result.lesson,
        invalidations: result.invalidations
      };
    }
  );

  await registerAiProposalRoutes(app, {
    auth: authRuntime,
    lessons: dependencies.lessons,
    invalidations: dependencies.invalidations,
    proposals: dependencies.proposals,
    proposalApplication: dependencies.proposalApplication,
    authorization: dependencies.authorization,
    clock: dependencies.clock,
    ids: dependencies.ids
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    await requireCsrf(request, authRuntime);
    const rawToken = sessionTokenFromRequest(request, config.sessionCookieName);
    await dependencies.sessions.revoke(rawToken);

    reply.clearCookie(config.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax'
    });
    return reply.code(204).send();
  });

  return app;
}
