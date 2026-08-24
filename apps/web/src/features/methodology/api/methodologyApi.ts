import type { GovernanceResponse } from '../../../entities/lesson/model.js';
import type { MethodologyRecommendationBundle } from '../../../entities/methodology/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';

export async function getMethodologyRecommendations(api: ApiClient, lessonId: string): Promise<MethodologyRecommendationBundle> {
  return (await api.request<ApiData<MethodologyRecommendationBundle>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/methodology/recommendations`
  )).data;
}

export function addApprovedOutcome(api: ApiClient, input: { lessonId: string; value: string; expectedLessonVersion: number }): Promise<GovernanceResponse> {
  return api.request<GovernanceResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/outcomes`,
    { method: 'POST', body: JSON.stringify({ value: input.value, expectedLessonVersion: input.expectedLessonVersion }) },
    { csrf: true }
  );
}

export function useMethodologyRecommendation(api: ApiClient, input: {
  lessonId: string;
  recommendationId: string;
  methodId: string;
  formId: string;
  techniqueIds: string[];
  expectedLessonVersion: number;
}): Promise<GovernanceResponse> {
  return api.request<GovernanceResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/methodology/recommendations/${encodeURIComponent(input.recommendationId)}/use`,
    { method: 'POST', body: JSON.stringify({
      expectedLessonVersion: input.expectedLessonVersion,
      methodId: input.methodId,
      formId: input.formId,
      techniqueIds: input.techniqueIds
    }) },
    { csrf: true }
  );
}

export async function rejectMethodologyRecommendation(api: ApiClient, lessonId: string, recommendationId: string): Promise<void> {
  await api.request<{ accepted: true }>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/methodology/recommendations/${encodeURIComponent(recommendationId)}/reject`,
    { method: 'POST' },
    { csrf: true }
  );
}
