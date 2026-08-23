import type { Course, Lesson } from '@tehkarta/domain';

export type { Course, GovernedField, Lesson } from '@tehkarta/domain';

export type CoreDecisionKey = 'goal' | 'problemQuestion' | 'bigIdea';

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

export interface LessonInvalidation {
  id: string;
  lessonId: string;
  sourceDecisionId: string;
  sourceRevision: number;
  affectedSemanticKey: string;
  status: 'STALE' | 'RESOLVED' | 'IGNORED';
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface LoginMembership {
  workspaceId: string;
  role: string;
  permissions: readonly string[];
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  memberships: LoginMembership[];
  csrfToken: string;
  expiresAt: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  workspace: {
    id: string;
    role: string;
    permissions: readonly string[];
  };
}

export interface ApiData<T> {
  data: T;
}

export interface GovernanceResponse {
  data: Lesson;
  invalidations: LessonInvalidation[];
}

export interface ApiErrorPayload {
  error?: string;
  code?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  requestId?: string;
}

export interface WorkspaceSnapshot {
  courses: CourseSummary[];
  course: Course | null;
  lessons: LessonSummary[];
  lesson: Lesson | null;
  invalidations: LessonInvalidation[];
}
