import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture } from '../../../test/fixtures.js';
import { useScenario } from './useScenario.js';

test('scenario draft is generated locally and saved with its lesson dependency version', async () => {
  const lesson = lessonFixture({ version: 9 });
  const saveArtifact = vi.fn(async () => undefined);
  const { result } = renderHook(() => useScenario({ lesson, context: null, artifacts: [], saveArtifact }));
  expect(result.current.stages).toHaveLength(5);
  await act(() => result.current.save());
  expect(saveArtifact).toHaveBeenCalledWith('SCENARIO', expect.objectContaining({ generatedFromLessonVersion: 9 }));
});

test('scenario draft survives an equivalent lesson object refresh', () => {
  const initialLesson = lessonFixture({ version: 9 });
  const saveArtifact = vi.fn(async () => undefined);
  const { result, rerender } = renderHook(
    ({ lesson }) => useScenario({ lesson, context: null, artifacts: [], saveArtifact }),
    { initialProps: { lesson: initialLesson } }
  );
  act(() => result.current.setStages((current) => current.map((stage, index) => index === 0 ? { ...stage, title: 'Черновик учителя' } : stage)));
  rerender({ lesson: { ...initialLesson } });
  expect(result.current.stages[0]?.title).toBe('Черновик учителя');
});
