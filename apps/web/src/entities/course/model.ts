import type { Course as DomainCourse } from '@tehkarta/domain';

export type Course = DomainCourse;

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
  sourceFragments: Array<{
    sourceId: string;
    sourceTitle: string;
    sourceRole: CourseSourceRole;
    unitId: string;
    ordinal: number;
    pageStart?: number;
    pageEnd?: number;
    text: string;
    contentHash: string;
  }>;
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
