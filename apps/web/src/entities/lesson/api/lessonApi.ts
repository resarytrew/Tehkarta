import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';
import type { Lesson, LessonInvalidation } from '../model.js';

export async function getLesson(api: ApiClient, lessonId: string): Promise<Lesson> {
  return (await api.request<ApiData<Lesson>>(`/api/v1/lessons/${encodeURIComponent(lessonId)}`)).data;
}

export async function listInvalidations(api: ApiClient, lessonId: string): Promise<LessonInvalidation[]> {
  return (await api.request<ApiData<LessonInvalidation[]>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/invalidations`
  )).data;
}
