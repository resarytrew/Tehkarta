import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture, lessonWorkspaceFixture, TestProviders } from '../../../test/fixtures.js';
import { useMethodology } from './useMethodology.js';

test('methodology mutation exposes local busy state and applies server response explicitly', async () => {
  let resolveResponse: ((value: Response) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
  const applyGovernance = vi.fn();
  const refreshMethodology = vi.fn(async () => undefined);
  const refreshScenario = vi.fn(async () => undefined);
  const onLessonVersionChange = vi.fn();
  const workspace = lessonWorkspaceFixture({ lesson: lessonFixture(), applyGovernance, refreshMethodology, refreshScenario });
  const { result } = renderHook(() => useMethodology({ ...workspace, bundle: workspace.methodology }, onLessonVersionChange), { wrapper: TestProviders });
  let pending: Promise<void> | undefined;
  act(() => { pending = result.current.addOutcome('Ученик объясняет причинно-следственную связь'); });
  expect(result.current.addingOutcome).toBe(true);
  resolveResponse?.(new Response(JSON.stringify({ data: { ...workspace.lesson, version: 4 }, invalidations: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await act(async () => { await pending; });
  expect(applyGovernance).toHaveBeenCalledOnce();
  expect(refreshMethodology).toHaveBeenCalledOnce();
  expect(refreshScenario).toHaveBeenCalledOnce();
  expect(onLessonVersionChange).toHaveBeenCalledWith('lesson-1', 4);
  expect(result.current.addingOutcome).toBe(false);
});

test('dependency-stale methodology mutation refreshes both lesson and recommendation bundle', async () => {
  const refreshLesson = vi.fn(async () => undefined);
  const refreshMethodology = vi.fn(async () => undefined);
  const workspace = lessonWorkspaceFixture({ refreshLesson, refreshMethodology });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'DEPENDENCY_STALE' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  const { result } = renderHook(() => useMethodology({ ...workspace, bundle: workspace.methodology }, () => undefined), { wrapper: TestProviders });
  await act(() => result.current.addOutcome('Новый результат'));
  expect(refreshLesson).toHaveBeenCalledOnce();
  expect(refreshMethodology).toHaveBeenCalledOnce();
});
