import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError } from './index.js';

export type CoursePlanStatus = 'DRAFT' | 'APPROVED';
export type LessonProgressStatus = 'PLANNED' | 'TAUGHT' | 'ASSESSED';
export type CourseSourceRole =
  | 'WORKING_PROGRAM'
  | 'TEXTBOOK'
  | 'METHOD_GUIDE'
  | 'ATLAS'
  | 'WORKBOOK'
  | 'ASSESSMENT'
  | 'OTHER';

export interface CourseLessonProgression {
  lessonId: string;
  position: number;
  topic: string;
  contentSummary: string;
  concepts: string[];
  dates: string[];
  personalities: string[];
  expectedOutcomes: string[];
  progressStatus: LessonProgressStatus;
}

export interface CoursePlan {
  id: string;
  workspaceId: string;
  courseId: string;
  revision: number;
  status: CoursePlanStatus;
  goals: string[];
  plannedOutcomes: string[];
  contentSummary: string;
  lessons: CourseLessonProgression[];
  approvedAt?: string;
  approvedBy?: string;
  updatedAt: string;
}

export interface CourseSourceDocument {
  bindingId: string;
  documentId: string;
  title: string;
  sourceRole: CourseSourceRole;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  rightsBasis: string;
  processingStatus: 'READY' | 'FAILED';
  status: CoursePlanStatus;
  pageCount?: number;
  fragmentCount: number;
  createdAt: string;
}

export interface CourseSourceFragment {
  sourceId: string;
  sourceTitle: string;
  sourceRole: CourseSourceRole;
  unitId: string;
  ordinal: number;
  pageStart?: number;
  pageEnd?: number;
  text: string;
  contentHash: string;
}

export interface ApprovedCourseLessonContext {
  courseId: string;
  planRevision: number;
  contextRevision: string;
  courseGoals: string[];
  plannedOutcomes: string[];
  contentSummary: string;
  previousLessons: CourseLessonProgression[];
  currentLesson?: CourseLessonProgression;
  nextLessons: CourseLessonProgression[];
  sourceFragments: CourseSourceFragment[];
}

export interface CoursePlanningSnapshot {
  plan: CoursePlan | null;
  sources: CourseSourceDocument[];
  readiness: {
    canDesignLessons: boolean;
    missing: string[];
    approvedSourceCount: number;
  };
}

export interface CoursePlanDraftInput {
  expectedRevision: number;
  goals: string[];
  plannedOutcomes: string[];
  contentSummary: string;
  lessons: CourseLessonProgression[];
}

export interface CourseSourceUploadInput {
  title: string;
  sourceRole: CourseSourceRole;
  mimeType: string;
  rightsBasis: string;
  checksumSha256: string;
  bytes: Uint8Array;
  pageCount?: number;
  extractedText: string;
}

export interface CoursePlanningRepository {
  getSnapshot(context: RequestContext, courseId: string): Promise<CoursePlanningSnapshot>;
  saveDraft(
    context: RequestContext,
    input: { courseId: string; planId: string; revisionId: string; draft: CoursePlanDraftInput; at: string }
  ): Promise<CoursePlanningSnapshot>;
  approve(
    context: RequestContext,
    input: { courseId: string; expectedRevision: number; revisionId: string; at: string }
  ): Promise<CoursePlanningSnapshot>;
  addSource(
    context: RequestContext,
    input: CourseSourceUploadInput & {
      courseId: string;
      documentId: string;
      bindingId: string;
      sourceUnitIds: string[];
      at: string;
    }
  ): Promise<CoursePlanningSnapshot>;
  approveSource(
    context: RequestContext,
    input: { courseId: string; bindingId: string; at: string }
  ): Promise<CoursePlanningSnapshot>;
  getApprovedLessonContext(
    context: RequestContext,
    courseId: string,
    lessonId: string
  ): Promise<ApprovedCourseLessonContext | null>;
}

const sourceRoles = new Set<CourseSourceRole>([
  'WORKING_PROGRAM', 'TEXTBOOK', 'METHOD_GUIDE', 'ATLAS', 'WORKBOOK', 'ASSESSMENT', 'OTHER'
]);
const progressStatuses = new Set<LessonProgressStatus>(['PLANNED', 'TAUGHT', 'ASSESSED']);

function cleanText(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new ApplicationError('VALIDATION_FAILED', `${field} must be a string.`);
  const cleaned = value.trim();
  if ((!allowEmpty && cleaned.length === 0) || cleaned.length > max) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} has an invalid length.`);
  }
  return cleaned;
}

function cleanList(value: unknown, field: string, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be an array with at most ${maxItems} items.`);
  }
  return value.map((item, index) => cleanText(item, `${field}[${index}]`, 500));
}

export function validateCoursePlanDraft(value: CoursePlanDraftInput): CoursePlanDraftInput {
  if (!Number.isInteger(value.expectedRevision) || value.expectedRevision < 0) {
    throw new ApplicationError('VALIDATION_FAILED', 'expectedRevision must be a non-negative integer.');
  }
  if (!Array.isArray(value.lessons) || value.lessons.length === 0 || value.lessons.length > 500) {
    throw new ApplicationError('VALIDATION_FAILED', 'lessons must contain between 1 and 500 items.');
  }
  const lessonIds = new Set<string>();
  const positions = new Set<number>();
  const lessons = value.lessons.map((lesson, index) => {
    const lessonId = cleanText(lesson.lessonId, `lessons[${index}].lessonId`, 200);
    if (lessonIds.has(lessonId)) throw new ApplicationError('VALIDATION_FAILED', `Duplicate lessonId: ${lessonId}.`);
    lessonIds.add(lessonId);
    if (!Number.isInteger(lesson.position) || lesson.position < 1 || positions.has(lesson.position)) {
      throw new ApplicationError('VALIDATION_FAILED', `Invalid or duplicate lesson position: ${lesson.position}.`);
    }
    positions.add(lesson.position);
    if (!progressStatuses.has(lesson.progressStatus)) {
      throw new ApplicationError('VALIDATION_FAILED', `Unsupported progressStatus: ${lesson.progressStatus}.`);
    }
    return {
      lessonId,
      position: lesson.position,
      topic: cleanText(lesson.topic, `lessons[${index}].topic`, 500),
      contentSummary: cleanText(lesson.contentSummary, `lessons[${index}].contentSummary`, 4_000, true),
      concepts: cleanList(lesson.concepts, `lessons[${index}].concepts`),
      dates: cleanList(lesson.dates, `lessons[${index}].dates`),
      personalities: cleanList(lesson.personalities, `lessons[${index}].personalities`),
      expectedOutcomes: cleanList(lesson.expectedOutcomes, `lessons[${index}].expectedOutcomes`),
      progressStatus: lesson.progressStatus
    };
  });
  return {
    expectedRevision: value.expectedRevision,
    goals: cleanList(value.goals, 'goals'),
    plannedOutcomes: cleanList(value.plannedOutcomes, 'plannedOutcomes'),
    contentSummary: cleanText(value.contentSummary, 'contentSummary', 12_000, true),
    lessons
  };
}

export function validateCourseSourceUpload(value: CourseSourceUploadInput): CourseSourceUploadInput {
  if (!sourceRoles.has(value.sourceRole)) {
    throw new ApplicationError('VALIDATION_FAILED', `Unsupported sourceRole: ${value.sourceRole}.`);
  }
  const supported = new Set(['application/pdf', 'text/plain', 'text/markdown']);
  if (!supported.has(value.mimeType)) {
    throw new ApplicationError('VALIDATION_FAILED', 'Only PDF, TXT and Markdown documents are supported.');
  }
  if (value.bytes.byteLength < 1 || value.bytes.byteLength > 10_485_760) {
    throw new ApplicationError('VALIDATION_FAILED', 'Document size must be between 1 byte and 10 MB.');
  }
  const extractedText = cleanText(value.extractedText, 'extractedText', 2_000_000);
  return {
    title: cleanText(value.title, 'title', 500),
    sourceRole: value.sourceRole,
    mimeType: value.mimeType,
    rightsBasis: cleanText(value.rightsBasis, 'rightsBasis', 500),
    checksumSha256: cleanText(value.checksumSha256, 'checksumSha256', 64),
    bytes: value.bytes,
    ...(value.pageCount !== undefined ? { pageCount: value.pageCount } : {}),
    extractedText
  };
}

export function coursePlanningReadiness(snapshot: Omit<CoursePlanningSnapshot, 'readiness'>): CoursePlanningSnapshot['readiness'] {
  const missing: string[] = [];
  if (!snapshot.plan) missing.push('План курса не создан.');
  else {
    if (snapshot.plan.status !== 'APPROVED') missing.push('План курса не утверждён педагогом.');
    if (snapshot.plan.goals.length === 0) missing.push('Не заданы цели курса.');
    if (snapshot.plan.plannedOutcomes.length === 0) missing.push('Не заданы планируемые результаты курса.');
    if (snapshot.plan.lessons.some((lesson) => lesson.concepts.length === 0 && !lesson.contentSummary)) {
      missing.push('Для части уроков не определено содержание или понятия.');
    }
  }
  const approvedSourceCount = snapshot.sources.filter((source) => source.status === 'APPROVED').length;
  if (approvedSourceCount === 0) missing.push('Нет утверждённых источников курса.');
  return { canDesignLessons: missing.length === 0, missing, approvedSourceCount };
}

export class SaveCoursePlanDraft {
  constructor(private readonly deps: { planning: CoursePlanningRepository; clock: Clock; ids: IdGenerator }) {}

  execute(context: RequestContext, courseId: string, draft: CoursePlanDraftInput): Promise<CoursePlanningSnapshot> {
    return this.deps.planning.saveDraft(context, {
      courseId,
      planId: this.deps.ids.generate('course_plan'),
      revisionId: this.deps.ids.generate('course_plan_revision'),
      draft: validateCoursePlanDraft(draft),
      at: this.deps.clock.now().toISOString()
    });
  }
}

export class ApproveCoursePlan {
  constructor(private readonly deps: { planning: CoursePlanningRepository; clock: Clock; ids: IdGenerator }) {}

  async execute(context: RequestContext, courseId: string, expectedRevision: number): Promise<CoursePlanningSnapshot> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ApplicationError('VALIDATION_FAILED', 'expectedRevision must be a positive integer.');
    }
    const snapshot = await this.deps.planning.getSnapshot(context, courseId);
    if (!snapshot.plan) throw new ApplicationError('NOT_FOUND', 'Course plan was not found.');
    const readiness = coursePlanningReadiness({ plan: { ...snapshot.plan, status: 'APPROVED' }, sources: snapshot.sources });
    if (readiness.missing.some((item) => !item.includes('не утверждён'))) {
      throw new ApplicationError('VALIDATION_FAILED', 'Course plan is incomplete.', { missing: readiness.missing });
    }
    return this.deps.planning.approve(context, {
      courseId,
      expectedRevision,
      revisionId: this.deps.ids.generate('course_plan_revision'),
      at: this.deps.clock.now().toISOString()
    });
  }
}

export class AddCourseSource {
  constructor(private readonly deps: { planning: CoursePlanningRepository; clock: Clock; ids: IdGenerator }) {}

  execute(context: RequestContext, courseId: string, raw: CourseSourceUploadInput): Promise<CoursePlanningSnapshot> {
    const input = validateCourseSourceUpload(raw);
    const chunks = Math.ceil(input.extractedText.length / 3_000);
    return this.deps.planning.addSource(context, {
      ...input,
      courseId,
      documentId: this.deps.ids.generate('source'),
      bindingId: this.deps.ids.generate('course_source'),
      sourceUnitIds: Array.from({ length: chunks }, () => this.deps.ids.generate('source_unit')),
      at: this.deps.clock.now().toISOString()
    });
  }
}

export class ApproveCourseSource {
  constructor(private readonly deps: { planning: CoursePlanningRepository; clock: Clock }) {}

  execute(context: RequestContext, courseId: string, bindingId: string): Promise<CoursePlanningSnapshot> {
    return this.deps.planning.approveSource(context, {
      courseId,
      bindingId: cleanText(bindingId, 'bindingId', 200),
      at: this.deps.clock.now().toISOString()
    });
  }
}
