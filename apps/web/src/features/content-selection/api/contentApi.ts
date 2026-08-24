import type { ContentSelectionDecision, LessonContentContext, SetContentSelectionResponse } from '../../../entities/content/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';

export async function getLessonContentContext(api: ApiClient, lessonId: string): Promise<LessonContentContext> {
  return (await api.request<ApiData<LessonContentContext>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/content-context`
  )).data;
}

export function setUmkContentDecision(api: ApiClient, input: {
  lessonId: string;
  mappingId: string;
  decision: ContentSelectionDecision;
  expectedLessonVersion: number;
}): Promise<SetContentSelectionResponse> {
  return api.request<SetContentSelectionResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/content-selection/umk/${encodeURIComponent(input.mappingId)}`,
    { method: 'POST', body: JSON.stringify({ decision: input.decision, expectedLessonVersion: input.expectedLessonVersion }) },
    { csrf: true }
  );
}
