import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture, lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
import { useGovernedDecisions } from './useGovernedDecisions.js';

test('governed mutation reloads authoritative lesson after stale version', async () => {
  const refreshLesson = vi.fn(async () => undefined);
  const workspace = lessonWorkspaceFixture({ refreshLesson });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'STALE_VERSION' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  const { result } = renderHook(() => useGovernedDecisions(workspace, () => undefined), { wrapper: TestProviders });
  await expect(act(() => result.current.saveDraft('goal', 'Новая цель урока'))).rejects.toThrow('Данные изменились');
  expect(refreshLesson).toHaveBeenCalledOnce();
  expect(result.current.busyKey).toBeNull();
});

test('governed draft sends optimistic lesson version and field revision', async () => {
  const lesson = lessonFixture({
    goal: { fieldId: 'goal-field', value: 'Старая цель', meta: { revision: 5, source: 'TEACHER', status: 'EDITED', updatedAt: '' } }
  });
  const applyGovernance = vi.fn();
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ data: { ...lesson, version: 4 }, invalidations: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const workspace = lessonWorkspaceFixture({ lesson, applyGovernance });
  const { result } = renderHook(() => useGovernedDecisions(workspace, () => undefined), { wrapper: TestProviders });
  await act(() => result.current.saveDraft('goal', 'Новая цель'));
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body).toMatchObject({ expectedLessonVersion: 3, expectedFieldRevision: 5, value: 'Новая цель' });
  expect(applyGovernance).toHaveBeenCalledOnce();
});
