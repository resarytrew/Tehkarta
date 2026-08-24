import type { GovernedField as DomainGovernedField, Lesson as DomainLesson } from '@tehkarta/domain';

export type Lesson = DomainLesson;
export type GovernedField<T> = DomainGovernedField<T>;
export type CoreDecisionKey = 'goal' | 'problemQuestion' | 'bigIdea';

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

export interface GovernanceResponse {
  data: Lesson;
  invalidations: LessonInvalidation[];
}
