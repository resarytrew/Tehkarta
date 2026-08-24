import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';
import type { Course, CourseSummary } from '../model.js';
import type { LessonSummary } from '../../lesson/model.js';

export async function listCourses(api: ApiClient): Promise<CourseSummary[]> {
  return (await api.request<ApiData<CourseSummary[]>>('/api/v1/courses')).data;
}

export async function getCourse(api: ApiClient, courseId: string): Promise<Course> {
  return (await api.request<ApiData<Course>>(`/api/v1/courses/${encodeURIComponent(courseId)}`)).data;
}

export async function listLessons(api: ApiClient, courseId: string): Promise<LessonSummary[]> {
  return (await api.request<ApiData<LessonSummary[]>>(
    `/api/v1/courses/${encodeURIComponent(courseId)}/lessons`
  )).data;
}
