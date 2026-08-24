import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
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
