import { useCallback, useState } from 'react';

export interface WorkspaceSelection {
  courseId: string | null;
  lessonId: string | null;
}

export function readWorkspaceSelection(location: Pick<Location, 'search'> = window.location): WorkspaceSelection {
  const query = new URLSearchParams(location.search);
  return { courseId: query.get('course'), lessonId: query.get('lesson') };
}

export function writeWorkspaceSelection(
  selection: WorkspaceSelection,
  location: Pick<Location, 'href'> = window.location,
  history: Pick<History, 'replaceState'> = window.history
): void {
  const url = new URL(location.href);
  if (selection.courseId) url.searchParams.set('course', selection.courseId);
  else url.searchParams.delete('course');
  if (selection.lessonId) url.searchParams.set('lesson', selection.lessonId);
  else url.searchParams.delete('lesson');
  history.replaceState(null, '', url);
}

export function useWorkspaceSelection() {
  const [selection, setSelection] = useState<WorkspaceSelection>(() => readWorkspaceSelection());

  const selectCourse = useCallback((courseId: string) => {
    const next = { courseId, lessonId: null };
    setSelection(next);
    writeWorkspaceSelection(next);
  }, []);

  const selectLesson = useCallback((courseId: string, lessonId: string) => {
    const next = { courseId, lessonId };
    setSelection(next);
    writeWorkspaceSelection(next);
  }, []);

  const clearLessonSelection = useCallback(() => {
    setSelection((current) => {
      const next = { ...current, lessonId: null };
      writeWorkspaceSelection(next);
      return next;
    });
  }, []);

  return {
    selectedCourseId: selection.courseId,
    selectedLessonId: selection.lessonId,
    selectCourse,
    selectLesson,
    clearLessonSelection
  };
}
