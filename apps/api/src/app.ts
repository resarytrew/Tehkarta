import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { ApplicationError, type CourseRepository, type LessonRepository } from '@tehkarta/application';
import {
  AuthenticationError,
  type SessionService
} from '@tehkarta/identity';
import type { AuthorizationPolicy } from '@tehkarta/ports';
import {
  requestContextFromPrincipal,
  requireCsrf,
  requireWorkspacePrincipal,
  sendAuthenticationError,
  sessionTokenFromRequest
} from './auth.js';
import type { ApiConfig } from './config.js';

export interface ApiDependencies {
  sessions: SessionService;
  courses: CourseRepository;
  lessons: LessonRepository;
  authorization: AuthorizationPolicy;
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

export async function createApiApp(
  config: ApiConfig,
  dependencies: ApiDependencies
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id'
  });

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

  app.get('/api/v1/me', async (request) => {
    const principal = await requireWorkspacePrincipal(request, {
      sessions: dependencies.sessions,
      sessionCookieName: config.sessionCookieName
    });

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

  app.get<{ Params: { courseId: string } }>('/api/v1/courses/:courseId', async (request) => {
    const principal = await requireWorkspacePrincipal(request, {
      sessions: dependencies.sessions,
      sessionCookieName: config.sessionCookieName
    });
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

  app.get<{ Params: { lessonId: string } }>('/api/v1/lessons/:lessonId', async (request) => {
    const principal = await requireWorkspacePrincipal(request, {
      sessions: dependencies.sessions,
      sessionCookieName: config.sessionCookieName
    });
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

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const runtime = {
      sessions: dependencies.sessions,
      sessionCookieName: config.sessionCookieName
    };
    await requireCsrf(request, runtime);
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
