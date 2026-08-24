import {
  approveGovernedField,
  editGovernedField,
  type GovernedField,
  type Lesson
} from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';

export type CoreLessonDecisionKey = 'goal' | 'problemQuestion' | 'bigIdea';

export type AffectedLessonSemanticKey =
  | 'goal'
  | 'problemQuestion'
  | 'bigIdea'
  | 'pedagogicalStyle'
  | 'communicationTone'
  | 'pedagogicalFocus'
  | 'pedagogicalTechnology'
  | 'outcome'
  | 'method'
  | 'technique'
  | 'form'
  | 'content'
  | 'stage'
  | 'material'
  | 'assessment'
  | 'homework'
  | 'finalConclusion';

export interface LessonInvalidation {
  id: string;
  lessonId: string;
  sourceDecisionId: string;
  sourceRevision: number;
  affectedSemanticKey: AffectedLessonSemanticKey | string;
  status: 'STALE' | 'RESOLVED' | 'IGNORED';
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface LessonInvalidationRepository {
  markStale(
    context: RequestContext,
    input: {
      lessonId: string;
      sourceDecisionId: string;
      sourceRevision: number;
      affectedSemanticKeys: readonly AffectedLessonSemanticKey[];
    }
  ): Promise<void>;
  listOpen(context: RequestContext, lessonId: string): Promise<LessonInvalidation[]>;
}

const CORE_DECISION_IMPACT: Record<CoreLessonDecisionKey, readonly AffectedLessonSemanticKey[]> = {
  goal: [
    'outcome',
    'method',
    'technique',
    'form',
    'content',
    'stage',
    'assessment',
    'homework',
    'finalConclusion'
  ],
  problemQuestion: [
    'bigIdea',
    'outcome',
    'method',
    'technique',
    'form',
    'content',
    'stage',
    'material',
    'assessment',
    'homework',
    'finalConclusion'
  ],
  bigIdea: [
    'outcome',
    'content',
    'stage',
    'material',
    'assessment',
    'homework',
    'finalConclusion'
  ]
};

export function affectedByCoreDecision(
  key: CoreLessonDecisionKey
): readonly AffectedLessonSemanticKey[] {
  return CORE_DECISION_IMPACT[key];
}

function getCoreDecision(
  lesson: Lesson,
  key: CoreLessonDecisionKey
): GovernedField<string> | undefined {
  return lesson[key];
}

function withCoreDecision(
  lesson: Lesson,
  key: CoreLessonDecisionKey,
  field: GovernedField<string>
): Lesson {
  switch (key) {
    case 'goal':
      return { ...lesson, goal: field };
    case 'problemQuestion':
      return { ...lesson, problemQuestion: field };
    case 'bigIdea':
      return { ...lesson, bigIdea: field };
  }
}

function assertExpectedFieldRevision(
  field: GovernedField<string> | undefined,
  expectedFieldRevision: number | undefined,
  key: CoreLessonDecisionKey
): void {
  if (expectedFieldRevision === undefined) return;

  const actual = field?.meta.revision ?? 0;
  if (actual !== expectedFieldRevision) {
    throw new ApplicationError(
      'STALE_VERSION',
      `Decision ${key} was modified by another request.`,
      { expectedFieldRevision, actualFieldRevision: actual, semanticKey: key }
    );
  }
}

function normalizeDecisionValue(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3) {
    throw new ApplicationError('VALIDATION_FAILED', 'Decision text must contain at least 3 characters.');
  }
  if (normalized.length > 4_000) {
    throw new ApplicationError('VALIDATION_FAILED', 'Decision text must not exceed 4000 characters.');
  }
  return normalized;
}

export interface LessonGovernanceDependencies {
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  clock: Clock;
  ids: IdGenerator;
}

export class EditCoreLessonDecision {
  constructor(private readonly deps: LessonGovernanceDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      semanticKey: CoreLessonDecisionKey;
      value: string;
      expectedLessonVersion: number;
      expectedFieldRevision?: number;
    }
  ): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }

    const current = getCoreDecision(lesson, input.semanticKey);
    assertExpectedFieldRevision(current, input.expectedFieldRevision, input.semanticKey);

    const now = this.deps.clock.now().toISOString();
    const value = normalizeDecisionValue(input.value);
    const next: GovernedField<string> = current
      ? editGovernedField(current, value, context.actorUserId, now)
      : {
          fieldId: this.deps.ids.generate('decision'),
          value,
          meta: {
            revision: 1,
            source: 'TEACHER',
            status: 'EDITED',
            updatedAt: now,
            updatedBy: context.actorUserId
          }
        };

    const saved = await this.deps.lessons.save(
      context,
      withCoreDecision(lesson, input.semanticKey, next),
      { expectedVersion: input.expectedLessonVersion }
    );

    await this.deps.invalidations.markStale(context, {
      lessonId: lesson.id,
      sourceDecisionId: next.fieldId,
      sourceRevision: next.meta.revision,
      affectedSemanticKeys: affectedByCoreDecision(input.semanticKey)
    });

    return {
      lesson: saved,
      invalidations: await this.deps.invalidations.listOpen(context, lesson.id)
    };
  }
}

export class ApproveCoreLessonDecision {
  constructor(private readonly deps: LessonGovernanceDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      semanticKey: CoreLessonDecisionKey;
      expectedLessonVersion: number;
      expectedFieldRevision: number;
    }
  ): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }

    const current = getCoreDecision(lesson, input.semanticKey);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', `Decision ${input.semanticKey} does not exist.`);
    }
    assertExpectedFieldRevision(current, input.expectedFieldRevision, input.semanticKey);

    if (current.meta.status === 'APPROVED') {
      return {
        lesson,
        invalidations: await this.deps.invalidations.listOpen(context, lesson.id)
      };
    }

    const approved = approveGovernedField(
      current,
      context.actorUserId,
      this.deps.clock.now().toISOString()
    );
    const saved = await this.deps.lessons.save(
      context,
      withCoreDecision(lesson, input.semanticKey, approved),
      { expectedVersion: input.expectedLessonVersion }
    );

    return {
      lesson: saved,
      invalidations: await this.deps.invalidations.listOpen(context, lesson.id)
    };
  }
}
