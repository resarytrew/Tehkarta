import type { RequestContext } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';

export type LessonDesignArtifactKind = 'SCENARIO' | 'MATERIALS';

export interface LessonDesignArtifact {
  id: string;
  workspaceId: string;
  lessonId: string;
  kind: LessonDesignArtifactKind;
  revision: number;
  payload: Readonly<Record<string, unknown>>;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonDesignArtifactRepository {
  list(context: RequestContext, lessonId: string): Promise<LessonDesignArtifact[]>;
  save(
    context: RequestContext,
    input: {
      id: string;
      lessonId: string;
      kind: LessonDesignArtifactKind;
      expectedRevision: number;
      payload: Readonly<Record<string, unknown>>;
      actorUserId: string;
      at: string;
    }
  ): Promise<LessonDesignArtifact>;
}

function text(value: unknown, field: string, max = 4_000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function validateScenario(payload: Readonly<Record<string, unknown>>): void {
  if (!Array.isArray(payload.stages) || payload.stages.length < 1 || payload.stages.length > 12) {
    throw new ApplicationError('VALIDATION_FAILED', 'Scenario must contain between 1 and 12 stages.');
  }
  for (const [index, stage] of payload.stages.entries()) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new ApplicationError('VALIDATION_FAILED', `Scenario stage ${index + 1} is invalid.`);
    }
    const item = stage as Record<string, unknown>;
    text(item.id, `stages[${index}].id`, 200);
    text(item.title, `stages[${index}].title`, 300);
    text(item.teacherAction, `stages[${index}].teacherAction`);
    text(item.studentAction, `stages[${index}].studentAction`);
    if (!Number.isInteger(item.minutes) || Number(item.minutes) < 1 || Number(item.minutes) > 120) {
      throw new ApplicationError('VALIDATION_FAILED', `stages[${index}].minutes is invalid.`);
    }
  }
}

function validateMaterials(payload: Readonly<Record<string, unknown>>): void {
  if (!Array.isArray(payload.items) || payload.items.length > 40) {
    throw new ApplicationError('VALIDATION_FAILED', 'Materials must be an array of at most 40 items.');
  }
  for (const [index, material] of payload.items.entries()) {
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
      throw new ApplicationError('VALIDATION_FAILED', `Material ${index + 1} is invalid.`);
    }
    const item = material as Record<string, unknown>;
    text(item.id, `items[${index}].id`, 200);
    text(item.title, `items[${index}].title`, 500);
    text(item.purpose, `items[${index}].purpose`, 2_000);
    if (typeof item.ready !== 'boolean') {
      throw new ApplicationError('VALIDATION_FAILED', `items[${index}].ready must be boolean.`);
    }
  }
}

export function validateLessonDesignArtifact(
  kind: LessonDesignArtifactKind,
  payload: Readonly<Record<string, unknown>>
): void {
  if (kind === 'SCENARIO') validateScenario(payload);
  else validateMaterials(payload);
}

export class SaveLessonDesignArtifact {
  constructor(
    private readonly deps: {
      lessons: LessonRepository;
      artifacts: LessonDesignArtifactRepository;
      now(): Date;
      generateId(prefix: string): string;
    }
  ) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      kind: LessonDesignArtifactKind;
      expectedLessonVersion: number;
      expectedRevision: number;
      payload: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonDesignArtifact> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    if (lesson.version !== input.expectedLessonVersion) {
      throw new ApplicationError('STALE_VERSION', 'Lesson changed while the artifact was edited.');
    }
    validateLessonDesignArtifact(input.kind, input.payload);
    return this.deps.artifacts.save(context, {
      id: this.deps.generateId('artifact'),
      lessonId: input.lessonId,
      kind: input.kind,
      expectedRevision: input.expectedRevision,
      payload: input.payload,
      actorUserId: context.actorUserId,
      at: this.deps.now().toISOString()
    });
  }
}
