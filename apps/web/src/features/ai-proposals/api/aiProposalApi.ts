import type { CoreDecisionKey } from '../../../entities/lesson/model.js';
import type { AiProposalAction, ApplyAiProposalResponse, LessonAiProposal } from '../../../entities/proposal/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';

export async function listAiProposals(api: ApiClient, lessonId: string, semanticKey?: CoreDecisionKey): Promise<LessonAiProposal[]> {
  const query = semanticKey ? `?semanticKey=${encodeURIComponent(semanticKey)}` : '';
  return (await api.request<ApiData<LessonAiProposal[]>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals${query}`
  )).data;
}

export async function getAiProposal(api: ApiClient, lessonId: string, proposalId: string): Promise<LessonAiProposal> {
  return (await api.request<ApiData<LessonAiProposal>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals/${encodeURIComponent(proposalId)}`
  )).data;
}

export async function requestAiProposal(api: ApiClient, input: {
  lessonId: string;
  semanticKey: CoreDecisionKey;
  action: AiProposalAction;
  expectedLessonVersion: number;
  requestKey: string;
  candidateCount?: number;
  teacherInstruction?: string;
}): Promise<LessonAiProposal> {
  return (await api.request<ApiData<LessonAiProposal>>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/ai-proposals`,
    { method: 'POST', body: JSON.stringify({
      semanticKey: input.semanticKey,
      action: input.action,
      expectedLessonVersion: input.expectedLessonVersion,
      requestKey: input.requestKey,
      candidateCount: input.candidateCount,
      teacherInstruction: input.teacherInstruction
    }) },
    { csrf: true }
  )).data;
}

export function applyAiProposalCandidate(api: ApiClient, input: {
  lessonId: string;
  proposalId: string;
  candidateId: string;
  expectedLessonVersion: number;
}): Promise<ApplyAiProposalResponse> {
  return api.request<ApplyAiProposalResponse>(
    `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/ai-proposals/${encodeURIComponent(input.proposalId)}/apply`,
    { method: 'POST', body: JSON.stringify({ candidateId: input.candidateId, expectedLessonVersion: input.expectedLessonVersion }) },
    { csrf: true }
  );
}

export async function dismissAiProposal(api: ApiClient, lessonId: string, proposalId: string): Promise<LessonAiProposal> {
  return (await api.request<ApiData<LessonAiProposal>>(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals/${encodeURIComponent(proposalId)}/dismiss`,
    { method: 'POST' },
    { csrf: true }
  )).data;
}
