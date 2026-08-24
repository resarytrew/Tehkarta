import type { CoreDecisionKey, GovernanceResponse } from '../../../entities/lesson/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';

export function editDecision(api: ApiClient, input: {
  lessonId: string;
  semanticKey: CoreDecisionKey;
  value: string;
  expectedLessonVersion: number;
  expectedFieldRevision?: number;
}): Promise<GovernanceResponse> {
  return api.request<GovernanceResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/decisions/${encodeURIComponent(input.semanticKey)}`,
    { method: 'PATCH', body: JSON.stringify({
      value: input.value,
      expectedLessonVersion: input.expectedLessonVersion,
      expectedFieldRevision: input.expectedFieldRevision
    }) },
    { csrf: true }
  );
}

export function approveDecision(api: ApiClient, input: {
  lessonId: string;
  semanticKey: CoreDecisionKey;
  expectedLessonVersion: number;
  expectedFieldRevision: number;
}): Promise<GovernanceResponse> {
  return api.request<GovernanceResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/decisions/${encodeURIComponent(input.semanticKey)}/approve`,
    { method: 'POST', body: JSON.stringify({
      expectedLessonVersion: input.expectedLessonVersion,
      expectedFieldRevision: input.expectedFieldRevision
    }) },
    { csrf: true }
  );
}
