import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture, lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
import { useMethodology } from './useMethodology.js';

test('methodology mutation exposes local busy state and applies server response explicitly', async () => {
  let resolveResponse: ((value: Response) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
  const applyGovernance = vi.fn();
  const workspace = lessonWorkspaceFixture({ lesson: lessonFixture(), applyGovernance });
  const { result } = renderHook(() => useMethodology(workspace, () => undefined), { wrapper: TestProviders });
  let pending: Promise<void> | undefined;
  act(() => { pending = result.current.addOutcome('Ученик объясняет причинно-следственную связь'); });
  expect(result.current.addingOutcome).toBe(true);
  resolveResponse?.(new Response(JSON.stringify({ data: { ...workspace.lesson, version: 4 }, invalidations: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await act(async () => { await pending; });
  expect(applyGovernance).toHaveBeenCalledOnce();
  expect(result.current.addingOutcome).toBe(false);
});
