import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';
import type { ApprovedScenarioContext, LessonDesignArtifact, LessonDesignArtifactKind } from '../model.js';

export async function getScenarioContext(api: ApiClient, lessonId: string): Promise<ApprovedScenarioContext> {
  return (await api.request<ApiData<ApprovedScenarioContext>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/scenario-context`
  )).data;
}

export async function listDesignArtifacts(api: ApiClient, lessonId: string): Promise<LessonDesignArtifact[]> {
  return (await api.request<ApiData<LessonDesignArtifact[]>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/design-artifacts`
  )).data;
}

export async function saveDesignArtifact(api: ApiClient, input: {
  lessonId: string;
  kind: LessonDesignArtifactKind;
  expectedLessonVersion: number;
  expectedRevision: number;
  payload: Readonly<Record<string, unknown>>;
}): Promise<LessonDesignArtifact> {
  return (await api.request<ApiData<LessonDesignArtifact>>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/design-artifacts/${encodeURIComponent(input.kind)}`,
    { method: 'PUT', body: JSON.stringify({
      expectedLessonVersion: input.expectedLessonVersion,
      expectedRevision: input.expectedRevision,
      payload: input.payload
    }) },
    { csrf: true }
  )).data;
}
