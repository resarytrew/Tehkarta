import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture } from '../../../test/fixtures.js';
import { useLessonWorkflow } from './useLessonWorkflow.js';

test('lesson workflow owns step navigation and runs enter refresh', async () => {
  const onEnter = vi.fn(async () => undefined);
  const lesson = lessonFixture();
  const { result } = renderHook(() => useLessonWorkflow({ lesson, content: null, context: null, artifacts: [], expertiseReady: false }, onEnter));
  await act(() => result.current.goTo(1));
  expect(result.current.activeStep).toBe(1);
  expect(onEnter).toHaveBeenCalledWith(1);
  await act(() => result.current.previous());
  expect(result.current.activeStep).toBe(1);
});

test('lesson workflow does not enter a locked step', async () => {
  const onEnter = vi.fn(async () => undefined);
  const { result } = renderHook(() => useLessonWorkflow({ lesson: lessonFixture(), content: null, context: null, artifacts: [], expertiseReady: false }, onEnter));
  await act(() => result.current.goTo(5));
  expect(result.current.activeStep).toBe(2);
  expect(onEnter).not.toHaveBeenCalled();
});
