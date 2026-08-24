import type { CommunicationTone, PedagogicalFocus, PedagogicalStyle } from '@tehkarta/domain';
import type { GovernanceResponse } from '../../../entities/lesson/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';

export type PedagogicalProfileKey = 'pedagogicalStyle' | 'communicationTone' | 'pedagogicalFocus';
export type PedagogicalProfileValue = PedagogicalStyle | CommunicationTone | PedagogicalFocus;

export function editPedagogicalProfile(api: ApiClient, input: { lessonId:string; key:PedagogicalProfileKey; value:PedagogicalProfileValue; expectedLessonVersion:number; expectedFieldRevision?:number }): Promise<GovernanceResponse> {
  return api.request(`/api/v1/lessons/${encodeURIComponent(input.lessonId)}/pedagogical-profile/${input.key}`, { method:'PATCH', body:JSON.stringify({ value:input.value, expectedLessonVersion:input.expectedLessonVersion, ...(input.expectedFieldRevision !== undefined ? { expectedFieldRevision:input.expectedFieldRevision } : {}) }) }, { csrf:true });
}

export function approvePedagogicalProfile(api: ApiClient, input: { lessonId:string; key:PedagogicalProfileKey; expectedLessonVersion:number; expectedFieldRevision:number }): Promise<GovernanceResponse> {
  return api.request(`/api/v1/lessons/${encodeURIComponent(input.lessonId)}/pedagogical-profile/${input.key}/approve`, { method:'POST', body:JSON.stringify({ expectedLessonVersion:input.expectedLessonVersion, expectedFieldRevision:input.expectedFieldRevision }) }, { csrf:true });
}
