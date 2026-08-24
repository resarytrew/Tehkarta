import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { readWorkspaceSelection, useWorkspaceSelection } from './useWorkspaceSelection.js';

describe('useWorkspaceSelection', () => {
  beforeEach(() => window.history.replaceState(null, '', '/?course=course-1&lesson=lesson-2'));

  test('restores selection and keeps URL in sync', () => {
    expect(readWorkspaceSelection()).toEqual({ courseId: 'course-1', lessonId: 'lesson-2' });
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => result.current.selectCourse('course-3'));
    expect(result.current.selectedCourseId).toBe('course-3');
    expect(result.current.selectedLessonId).toBeNull();
    expect(window.location.search).toBe('?course=course-3');
    act(() => result.current.selectLesson('course-3', 'lesson-4'));
    expect(window.location.search).toContain('lesson=lesson-4');
  });
});
