import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  ApplyLessonAiProposalCandidate,
  DismissLessonAiProposal,
  RequestCoreDecisionAiProposal,
  type AiProposalAction,
  type CoreLessonDecisionKey,
  type LessonAiProposalApplicationRepository,
  type LessonAiProposalRepository,
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

export interface AiProposalRouteDependencies {
  auth: AuthRuntime;
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  proposals: LessonAiProposalRepository;
  proposalApplication: LessonAiProposalApplicationRepository;
  authorization: AuthorizationPolicy;
  clock: Clock;
  ids: IdGenerator;
}

function parseCoreDecisionKey(value: string): CoreLessonDecisionKey {
  if (value === 'goal' || value === 'problemQuestion' || value === 'bigIdea') return value;
  throw new ApplicationError('VALIDATION_FAILED', `Unsupported AI proposal field: ${value}.`, {
    allowed: ['goal', 'problemQuestion', 'bigIdea']
  });
}

function parseAction(value: unknown): AiProposalAction {
  if (value === 'VARIANTS' || value === 'REGENERATE' || value === 'IMPROVE') return value;
  throw new ApplicationError('VALIDATION_FAILED', 'Unsupported AI proposal action.', {
    allowed: ['VARIANTS', 'REGENERATE', 'IMPROVE']
  });
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApplicationError('VALIDATION_FAILED', `${fieldName} must be a positive integer.`);
  }
  return value;
}

function candidateId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApplicationError('VALIDATION_FAILED', 'candidateId must be a string.');
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'candidateId must contain between 1 and 200 characters.'
    );
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
  if (!allowed) {
    throw new ApplicationError('FORBIDDEN', `You do not have permission to ${action}.`);
  }
}

export async function registerAiProposalRoutes(
  app: FastifyInstance,
  dependencies: AiProposalRouteDependencies
): Promise<void> {
  const requestProposal = new RequestCoreDecisionAiProposal({
    lessons: dependencies.lessons,
    proposals: dependencies.proposals,
    clock: dependencies.clock,
    ids: dependencies.ids
  });
  const applyProposalCandidate = new ApplyLessonAiProposalCandidate({
    lessons: dependencies.lessons,
    invalidations: dependencies.invalidations,
    proposals: dependencies.proposals,
    application: dependencies.proposalApplication,
    clock: dependencies.clock,
    ids: dependencies.ids
  });
  const dismissProposal = new DismissLessonAiProposal({
    lessons: dependencies.lessons,
    proposals: dependencies.proposals,
    clock: dependencies.clock
  });

  app.get<{
    Params: { lessonId: string };
    Querystring: { semanticKey?: string };
  }>('/api/v1/lessons/:lessonId/ai-proposals', async (request) => {
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:read');

    const lesson = await dependencies.lessons.getById(context, request.params.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${request.params.lessonId} was not found.`);
    }

    const semanticKey = request.query.semanticKey
      ? parseCoreDecisionKey(request.query.semanticKey)
      : undefined;

    return {
      data: await dependencies.proposals.listByLesson(context, lesson.id, semanticKey)
    };
  });

  app.get<{
    Params: { lessonId: string; proposalId: string };
  }>('/api/v1/lessons/:lessonId/ai-proposals/:proposalId', async (request) => {
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:read');

    const lesson = await dependencies.lessons.getById(context, request.params.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${request.params.lessonId} was not found.`);
    }

    const proposal = await dependencies.proposals.getById(context, request.params.proposalId);
    if (!proposal || proposal.lessonId !== lesson.id) {
      throw new ApplicationError(
        'NOT_FOUND',
        `AI proposal ${request.params.proposalId} was not found for lesson ${lesson.id}.`
      );
    }

    return { data: proposal };
  });

  app.post<{
    Params: { lessonId: string; proposalId: string };
    Body: { candidateId?: unknown; expectedLessonVersion?: unknown };
  }>('/api/v1/lessons/:lessonId/ai-proposals/:proposalId/apply', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:write');

    if (!request.body) {
      throw new ApplicationError('VALIDATION_FAILED', 'Request body is required.');
    }

    const result = await applyProposalCandidate.execute(context, {
      lessonId: request.params.lessonId,
      proposalId: request.params.proposalId,
      candidateId: candidateId(request.body.candidateId),
      expectedLessonVersion: positiveInteger(
        request.body.expectedLessonVersion,
        'expectedLessonVersion'
      )
    });

    return {
      data: result.lesson,
      proposal: result.proposal,
      invalidations: result.invalidations
    };
  });

  app.post<{
    Params: { lessonId: string; proposalId: string };
  }>('/api/v1/lessons/:lessonId/ai-proposals/:proposalId/dismiss', async (request) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:write');

    const proposal = await dismissProposal.execute(context, {
      lessonId: request.params.lessonId,
      proposalId: request.params.proposalId
    });

    return { data: proposal };
  });

  app.post<{
    Params: { lessonId: string };
    Body: {
      semanticKey?: unknown;
      action?: unknown;
      expectedLessonVersion?: unknown;
      candidateCount?: unknown;
      teacherInstruction?: unknown;
      requestKey?: unknown;
    };
  }>('/api/v1/lessons/:lessonId/ai-proposals', async (request, reply) => {
    await requireCsrf(request, dependencies.auth);
    const principal = await requireWorkspacePrincipal(request, dependencies.auth);
    const context = requestContextFromPrincipal(request, principal);
    await requirePermission(dependencies.authorization, context, 'lesson:write');

    if (!request.body) {
      throw new ApplicationError('VALIDATION_FAILED', 'Request body is required.');
    }

    const semanticKey = parseCoreDecisionKey(
      typeof request.body.semanticKey === 'string' ? request.body.semanticKey : ''
    );
    const action = parseAction(request.body.action);
    const expectedLessonVersion = positiveInteger(
      request.body.expectedLessonVersion,
      'expectedLessonVersion'
    );
    const candidateCount = request.body.candidateCount;
    if (candidateCount !== undefined) positiveInteger(candidateCount, 'candidateCount');

    const requestKey =
      typeof request.body.requestKey === 'string' ? request.body.requestKey.trim() : '';
    const teacherInstruction =
      typeof request.body.teacherInstruction === 'string'
        ? request.body.teacherInstruction
        : undefined;

    const command = {
      lessonId: request.params.lessonId,
      semanticKey,
      action,
      expectedLessonVersion,
      requestKey,
      ...(candidateCount !== undefined ? { candidateCount: candidateCount as number } : {}),
      ...(teacherInstruction !== undefined ? { teacherInstruction } : {})
    };

    const proposal = await requestProposal.execute(context, command);
    return reply.code(202).send({ data: proposal });
  });
}
