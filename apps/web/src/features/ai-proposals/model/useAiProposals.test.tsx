import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
import { useAiProposals } from './useAiProposals.js';

test('AI request recovery refreshes lesson and never mutates authoritative state', async () => {
  const refreshLesson = vi.fn(async () => undefined);
  const refreshProposals = vi.fn(async () => undefined);
  const applyGovernance = vi.fn();
  const workspace = lessonWorkspaceFixture({ refreshLesson, refreshProposals, applyGovernance });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'STALE_VERSION' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  const { result } = renderHook(() => useAiProposals(workspace, () => undefined), { wrapper: TestProviders });
  await expect(act(() => result.current.request('variants', 'goal'))).rejects.toThrow('Данные изменились');
  expect(refreshLesson).toHaveBeenCalledOnce();
  expect(refreshProposals).toHaveBeenCalledOnce();
  expect(applyGovernance).not.toHaveBeenCalled();
});

test('AI candidate application preserves optimistic version and refreshes downstream context', async () => {
  const lesson = lessonWorkspaceFixture().lesson!;
  const proposal = {
    id: 'proposal-1', workspaceId: lesson.workspaceId, lessonId: lesson.id, semanticKey: 'goal' as const,
    action: 'VARIANTS' as const, status: 'APPLIED' as const, requestedLessonVersion: lesson.version,
    candidateCountRequested: 1, candidates: [], asyncJobId: 'job-1', idempotencyKey: 'request-1',
    requestedBy: 'teacher', createdAt: '', updatedAt: ''
  };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ data: { ...lesson, version: 4 }, invalidations: [], proposal }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const applyGovernance = vi.fn();
  const putProposal = vi.fn();
  const refreshMethodology = vi.fn(async () => undefined);
  const refreshScenario = vi.fn(async () => undefined);
  const onLessonVersionChange = vi.fn();
  const workspace = lessonWorkspaceFixture({ lesson, applyGovernance, putProposal, refreshMethodology, refreshScenario });
  const { result } = renderHook(() => useAiProposals(workspace, onLessonVersionChange), { wrapper: TestProviders });
  await act(() => result.current.applyCandidate('proposal-1', 'candidate-1'));
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body).toMatchObject({ candidateId: 'candidate-1', expectedLessonVersion: 3 });
  expect(applyGovernance).toHaveBeenCalledOnce();
  expect(putProposal).toHaveBeenCalledWith(proposal);
  expect(refreshMethodology).toHaveBeenCalledOnce();
  expect(refreshScenario).toHaveBeenCalledOnce();
  expect(onLessonVersionChange).toHaveBeenCalledWith(lesson.id, 4);
});
