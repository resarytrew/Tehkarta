import type { Course, Lesson } from '@tehkarta/domain';
import type { OptimisticWriteOptions, RequestContext } from '@tehkarta/ports';

export type ApplicationErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'STALE_VERSION'
  | 'VALIDATION_FAILED'
  | 'DEPENDENCY_STALE'
  | 'EXTERNAL_SERVICE_FAILED';

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ApplicationErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.details = details;
  }
}

export interface UseCase<TCommand, TResult> {
  execute(context: RequestContext, command: TCommand): Promise<TResult>;
}

export interface CourseSummary {
  id: string;
  workspaceId: string;
  version: number;
  subject: string;
  grade: number;
  academicYear: string;
  title: string;
  sectionCount: number;
  lessonCount: number;
}

export interface LessonSummary {
  id: string;
  workspaceId: string;
  courseId: string;
  sectionId: string;
  version: number;
  order: number;
  title: string;
  durationMinutes: number;
  state: 'PLANNED' | 'DESIGNING' | 'READY' | 'ARCHIVED';
}

export interface CourseRepository {
  listSummaries(context: RequestContext): Promise<CourseSummary[]>;
  getById(context: RequestContext, courseId: string): Promise<Course | null>;
  save(context: RequestContext, course: Course, options: OptimisticWriteOptions): Promise<Course>;
}

export interface LessonRepository {
  listSummariesByCourse(context: RequestContext, courseId: string): Promise<LessonSummary[]>;
  getById(context: RequestContext, lessonId: string): Promise<Lesson | null>;
  save(context: RequestContext, lesson: Lesson, options: OptimisticWriteOptions): Promise<Lesson>;
}

export interface IdempotencyRecord<TResult = unknown> {
  workspaceId: string;
  key: string;
  operation: string;
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  result?: TResult;
  createdAt: string;
  expiresAt?: string;
}

export interface IdempotencyStore {
  get<TResult>(context: RequestContext, operation: string, key: string): Promise<IdempotencyRecord<TResult> | null>;
  begin(context: RequestContext, operation: string, key: string, ttlSeconds?: number): Promise<boolean>;
  succeed<TResult>(context: RequestContext, operation: string, key: string, result: TResult): Promise<void>;
  fail(context: RequestContext, operation: string, key: string): Promise<void>;
}

export interface PageRequest {
  limit: number;
  cursor?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}

export * from './lesson-governance.js';
export * from './ai-proposals.js';
export * from './ai-proposal-processing.js';
