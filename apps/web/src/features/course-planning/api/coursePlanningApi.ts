import type { CourseLessonProgression, CoursePlanningSnapshot, CourseSourceRole } from '../../../entities/course/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';

export async function getCoursePlanning(api: ApiClient, courseId: string): Promise<CoursePlanningSnapshot> {
  return (await api.request<ApiData<CoursePlanningSnapshot>>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/planning-context`
  )).data;
}

export async function saveCoursePlan(api: ApiClient, input: {
  courseId: string;
  expectedRevision: number;
  goals: string[];
  plannedOutcomes: string[];
  contentSummary: string;
  lessons: CourseLessonProgression[];
}): Promise<CoursePlanningSnapshot> {
  return (await api.request<ApiData<CoursePlanningSnapshot>>(
    `/api/v1/courses/${encodeURIComponent(input.courseId)}/plan`,
    { method: 'PUT', body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      goals: input.goals,
      plannedOutcomes: input.plannedOutcomes,
      contentSummary: input.contentSummary,
      lessons: input.lessons
    }) },
    { csrf: true }
  )).data;
}

export async function approveCoursePlan(api: ApiClient, courseId: string, expectedRevision: number): Promise<CoursePlanningSnapshot> {
  return (await api.request<ApiData<CoursePlanningSnapshot>>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/plan/approve`,
    { method: 'POST', body: JSON.stringify({ expectedRevision }) },
    { csrf: true }
  )).data;
}

export async function uploadCourseSource(api: ApiClient, input: {
  courseId: string;
  file: File;
  title: string;
  sourceRole: CourseSourceRole;
  rightsBasis: string;
}): Promise<CoursePlanningSnapshot> {
  const query = new URLSearchParams({ title: input.title, sourceRole: input.sourceRole, rightsBasis: input.rightsBasis });
  const form = new FormData();
  form.append('file', input.file);
  return (await api.request<ApiData<CoursePlanningSnapshot>>(
    `/api/v1/courses/${encodeURIComponent(input.courseId)}/sources?${query.toString()}`,
    { method: 'POST', body: form },
    { csrf: true }
  )).data;
}

export async function approveCourseSource(api: ApiClient, courseId: string, bindingId: string): Promise<CoursePlanningSnapshot> {
  return (await api.request<ApiData<CoursePlanningSnapshot>>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/sources/${encodeURIComponent(bindingId)}/approve`,
    { method: 'POST' },
    { csrf: true }
  )).data;
}
