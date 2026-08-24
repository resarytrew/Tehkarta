import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { lessonFixture } from '../../../test/fixtures.js';
import { useMaterials } from './useMaterials.js';

test('materials draft supports local additions and saves scenario provenance', async () => {
  const lesson = lessonFixture({ version: 11 });
  const saveArtifact = vi.fn(async () => undefined);
  const scenario = { artifact: { id: 'scenario', workspaceId: lesson.workspaceId, lessonId: lesson.id, kind: 'SCENARIO' as const, revision: 4, payload: {}, updatedBy: 'teacher', createdAt: '', updatedAt: '' }, stages: [] };
  const { result } = renderHook(() => useMaterials({ lesson, context: null, artifacts: [], scenario, saveArtifact }));
  const initialCount = result.current.items.length;
  act(() => result.current.add());
  expect(result.current.items).toHaveLength(initialCount + 1);
  await act(() => result.current.save());
  expect(saveArtifact).toHaveBeenCalledWith('MATERIALS', expect.objectContaining({ generatedFromLessonVersion: 11, generatedFromScenarioRevision: 4 }));
});

test('materials draft survives equivalent scenario stage array refreshes', () => {
  const lesson = lessonFixture({ version: 11 });
  const saveArtifact = vi.fn(async () => undefined);
  const artifact = { id: 'scenario', workspaceId: lesson.workspaceId, lessonId: lesson.id, kind: 'SCENARIO' as const, revision: 4, payload: {}, updatedBy: 'teacher', createdAt: '', updatedAt: '' };
  const { result, rerender } = renderHook(
    ({ stages }) => useMaterials({ lesson, context: null, artifacts: [], scenario: { artifact, stages }, saveArtifact }),
    { initialProps: { stages: [] as import('../../../entities/artifact/model.js').ScenarioStage[] } }
  );
  act(() => result.current.add());
  const draftCount = result.current.items.length;
  rerender({ stages: [] });
  expect(result.current.items).toHaveLength(draftCount);
});
