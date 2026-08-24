import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
import { useAiProposals } from './useAiProposals.js';

test('AI request recovery refreshes lesson and never mutates authoritative state', async () => {
  const refreshLesson = vi.fn(async () => undefined);
  const applyGovernance = vi.fn();
  const workspace = lessonWorkspaceFixture({ refreshLesson, applyGovernance });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'STALE_VERSION' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  const { result } = renderHook(() => useAiProposals(workspace, () => undefined), { wrapper: TestProviders });
  await expect(act(() => result.current.request('variants', 'goal'))).rejects.toThrow('Данные изменились');
  expect(refreshLesson).toHaveBeenCalledOnce();
  expect(applyGovernance).not.toHaveBeenCalled();
});
