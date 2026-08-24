import { useCallback, useEffect, useState } from 'react';
import { getCourse, listLessons } from '../entities/course/api/courseApi.js';
import type { Course } from '../entities/course/model.js';
import type { LessonSummary } from '../entities/lesson/model.js';
import { useApiClient } from '../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../shared/errors/useApiErrorRecovery.js';

export function useCourseWorkspace(courseId: string | null) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) {
      setCourse(null);
      setLessons([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCourse, nextLessons] = await Promise.all([
        getCourse(api, courseId),
        listLessons(api, courseId)
      ]);
      setCourse(nextCourse);
      setLessons(nextLessons);
    } catch (cause) {
      const classified = await recover(cause);
      setError(classified.message);
    } finally {
      setLoading(false);
    }
  }, [api, courseId, recover]);

  useEffect(() => { void refresh(); }, [refresh]);

  const updateLessonVersion = useCallback((lessonId: string, version: number) => {
    setLessons((current) => current.map((item) => item.id === lessonId ? { ...item, version } : item));
  }, []);

  return { course, lessons, loading, error, refresh, updateLessonVersion };
}
