import { useCallback, useEffect, useState } from 'react';
import type { CourseLessonProgression, CoursePlanningSnapshot, CourseSourceRole } from '../../../entities/course/model.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { approveCoursePlan, approveCourseSource, getCoursePlanning, saveCoursePlan, uploadCourseSource } from '../api/coursePlanningApi.js';

export function useCoursePlanning(courseId: string | null) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [snapshot, setSnapshot] = useState<CoursePlanningSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) { setSnapshot(null); return; }
    setLoading(true);
    try {
      setSnapshot(await getCoursePlanning(api, courseId));
    } catch (error) {
      await recover(error);
    } finally {
      setLoading(false);
    }
  }, [api, courseId, recover]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (input: {
    expectedRevision: number;
    goals: string[];
    plannedOutcomes: string[];
    contentSummary: string;
    lessons: CourseLessonProgression[];
  }) => {
    if (!courseId) return;
    setBusyAction('save');
    try {
      setSnapshot(await saveCoursePlan(api, { courseId, ...input }));
      notifications.success('Черновик плана сохранён. Утвердите его отдельно для использования в AI.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) await refresh();
      const classified = await recover(error);
      throw new Error(classified.message);
    } finally { setBusyAction(null); }
  }, [api, courseId, notifications, recover, refresh]);

  const approve = useCallback(async () => {
    if (!courseId || !snapshot?.plan) return;
    setBusyAction('approve');
    try {
      setSnapshot(await approveCoursePlan(api, courseId, snapshot.plan.revision));
      notifications.success('План курса утверждён и доступен всем урокам курса.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) await refresh();
      const classified = await recover(error);
      throw new Error(classified.message);
    } finally { setBusyAction(null); }
  }, [api, courseId, notifications, recover, refresh, snapshot?.plan]);

  const upload = useCallback(async (input: { file: File; title: string; sourceRole: CourseSourceRole; rightsBasis: string }) => {
    if (!courseId) return;
    setBusyAction('upload');
    try {
      setSnapshot(await uploadCourseSource(api, { courseId, ...input }));
      notifications.info('Документ сохранён. Разрешите его использование отдельным действием.');
    } catch (error) {
      const classified = await recover(error);
      throw new Error(classified.message);
    } finally { setBusyAction(null); }
  }, [api, courseId, notifications, recover]);

  const approveSource = useCallback(async (bindingId: string) => {
    if (!courseId) return;
    setBusyAction(bindingId);
    try {
      setSnapshot(await approveCourseSource(api, courseId, bindingId));
      notifications.success('Источник разрешён для AI-контекста курса.');
    } catch (error) {
      const classified = await recover(error);
      throw new Error(classified.message);
    } finally { setBusyAction(null); }
  }, [api, courseId, notifications, recover]);

  return { snapshot, loading, busyAction, refresh, save, approve, upload, approveSource };
}
