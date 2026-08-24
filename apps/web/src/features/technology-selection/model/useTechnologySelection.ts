import { useCallback, useEffect, useState } from 'react';
import type { GovernanceResponse, Lesson } from '../../../entities/lesson/model.js';
import type { TechnologyOption } from '../../../entities/methodology/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { approveTechnology, listTechnologies } from '../api/technologyApi.js';

export interface TechnologySelectionDependencies {
  lesson: Lesson;
  applyGovernance(response: GovernanceResponse): void;
  refreshLesson(): Promise<void>;
  refreshMethodology(): Promise<void>;
  refreshScenario(): Promise<void>;
}

export function useTechnologySelection(
  dependencies: TechnologySelectionDependencies,
  onLessonVersionChange: (lessonId: string, version: number) => void
) {
  const { lesson, applyGovernance, refreshLesson, refreshMethodology, refreshScenario } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [options, setOptions] = useState<TechnologyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setOptions(await listTechnologies(api, lesson.id));
    } catch (error) {
      await recover(error);
    } finally {
      setLoading(false);
    }
  }, [api, lesson.id, recover]);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = useCallback(async (technology: TechnologyOption) => {
    setBusyId(technology.technologyId);
    try {
      const response = await approveTechnology(api, {
        lessonId: lesson.id,
        technology,
        expectedLessonVersion: lesson.version,
        ...(lesson.pedagogicalTechnology ? { expectedFieldRevision: lesson.pedagogicalTechnology.meta.revision } : {})
      });
      applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([refreshMethodology(), refreshScenario()]);
      notifications.success(`Технология «${technology.name}» утверждена педагогом.`);
    } catch (error) {
      await recover(
        error,
        error instanceof ApiRequestError && error.status === 409
          ? async () => Promise.all([refreshLesson(), refreshMethodology(), refreshScenario()]).then(() => undefined)
          : undefined
      );
    } finally {
      setBusyId(null);
    }
  }, [api, applyGovernance, lesson.id, lesson.pedagogicalTechnology, lesson.version, notifications, onLessonVersionChange, recover, refreshLesson, refreshMethodology, refreshScenario]);

  return { options, loading, busyId, refresh, select };
}
