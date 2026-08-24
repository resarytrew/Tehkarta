import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture } from '../../../test/fixtures.js';
import { useLessonWorkflow } from './useLessonWorkflow.js';

test('lesson workflow owns step navigation and runs enter refresh', async () => {
  const onEnter = vi.fn(async () => undefined);
  const { result } = renderHook(() => useLessonWorkflow(lessonFixture(), onEnter));
  await act(() => result.current.goTo(5));
  expect(result.current.activeStep).toBe(5);
  expect(onEnter).toHaveBeenCalledWith(5);
  await act(() => result.current.previous());
  expect(result.current.activeStep).toBe(4);
});
