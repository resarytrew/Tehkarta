import type { Lesson } from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import type {
  LessonContentContext,
  LessonContentContextRepository,
  LessonUmkEvidenceItem
} from './content-context.js';
import type { LessonInvalidation, LessonInvalidationRepository } from './lesson-governance.js';

export type ContentSelectionDecision = 'INCLUDED' | 'EXCLUDED';

export interface LessonContentSelection {
  id: string;
  workspaceId: string;
  lessonId: string;
  sourceKind: 'UMK';
  sourceRefId: string;
  decision: ContentSelectionDecision;
  revision: number;
  contentPackId: string;
  contentPackVersion: string;
  sourceDocumentId: string;
  sourceDocumentVersion: string;
  sourceUnitId: string;
  titleSnapshot: string;
  contentHash?: string;
  actorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonContentSelectionRepository {
  setApprovedUmkDecision(
    context: RequestContext,
    input: {
      selectionId: string;
      lessonId: string;
      expectedLessonVersion: number;
      decision: ContentSelectionDecision;
      contentPackId: string;
      contentPackVersion: string;
      evidence: LessonUmkEvidenceItem;
      actorUserId: string;
      at: string;
    }
  ): Promise<{
    selection: LessonContentSelection;
    lessonVersion: number;
    changed: boolean;
  }>;
}

export const CONTENT_SELECTION_IMPACT = [
  'stage',
  'material',
  'assessment',
  'homework',
  'finalConclusion'
] as const;

export interface ContentSelectionDependencies {
  lessons: LessonRepository;
  contentContext: LessonContentContextRepository;
  selections: LessonContentSelectionRepository;
  invalidations: LessonInvalidationRepository;
  clock: Clock;
  ids: IdGenerator;
}

function assertExpectedLessonVersion(lesson: Lesson, expectedLessonVersion: number): void {
  if (lesson.version !== expectedLessonVersion) {
    throw new ApplicationError(
      'STALE_VERSION',
      `Lesson ${lesson.id} was modified by another request.`,
      { expectedLessonVersion, actualLessonVersion: lesson.version }
    );
  }
}

export class SetLessonUmkContentDecision {
  constructor(private readonly deps: ContentSelectionDependencies) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      mappingId: string;
      decision: ContentSelectionDecision;
      expectedLessonVersion: number;
    }
  ): Promise<{
    lesson: Lesson;
    contentContext: LessonContentContext;
    selection: LessonContentSelection;
    invalidations: LessonInvalidation[];
    changed: boolean;
  }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    }
    assertExpectedLessonVersion(lesson, input.expectedLessonVersion);

    if (input.decision !== 'INCLUDED' && input.decision !== 'EXCLUDED') {
      throw new ApplicationError('VALIDATION_FAILED', 'Unsupported content selection decision.');
    }

    const currentContext = await this.deps.contentContext.getForLesson(context, input.lessonId);
    if (!currentContext) {
      throw new ApplicationError('NOT_FOUND', `Content context for lesson ${input.lessonId} was not found.`);
    }

    const evidence = currentContext.umkEvidence.find((item) => item.mappingId === input.mappingId);
    if (!evidence) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Approved UMK mapping ${input.mappingId} is not available for this lesson.`
      );
    }

    const result = await this.deps.selections.setApprovedUmkDecision(context, {
      selectionId: this.deps.ids.generate('content_selection'),
      lessonId: lesson.id,
      expectedLessonVersion: input.expectedLessonVersion,
      decision: input.decision,
      contentPackId: currentContext.contentPack.id,
      contentPackVersion: currentContext.contentPack.version,
      evidence,
      actorUserId: context.actorUserId,
      at: this.deps.clock.now().toISOString()
    });

    if (result.changed) {
      await this.deps.invalidations.markStale(context, {
        lessonId: lesson.id,
        sourceDecisionId: result.selection.id,
        sourceRevision: result.selection.revision,
        affectedSemanticKeys: CONTENT_SELECTION_IMPACT
      });
    }

    const [savedLesson, refreshedContext, invalidations] = await Promise.all([
      this.deps.lessons.getById(context, lesson.id),
      this.deps.contentContext.getForLesson(context, lesson.id),
      this.deps.invalidations.listOpen(context, lesson.id)
    ]);

    if (!savedLesson || !refreshedContext) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${lesson.id} disappeared after content selection.`);
    }

    return {
      lesson: savedLesson,
      contentContext: refreshedContext,
      selection: result.selection,
      invalidations,
      changed: result.changed
    };
  }
}
