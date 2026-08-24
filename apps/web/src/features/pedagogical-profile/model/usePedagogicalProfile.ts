import { useCallback, useState } from 'react';
import type { GovernanceResponse, Lesson } from '../../../entities/lesson/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { approvePedagogicalProfile, editPedagogicalProfile, type PedagogicalProfileKey, type PedagogicalProfileValue } from '../api/pedagogicalProfileApi.js';

export interface PedagogicalProfileDependencies {
  lesson: Lesson;
  applyGovernance(response: GovernanceResponse): void;
  refreshLesson(): Promise<void>;
  refreshMethodology(): Promise<void>;
  refreshScenario(): Promise<void>;
}

function fieldFor(lesson: Lesson, key: PedagogicalProfileKey) {
  if (key === 'pedagogicalStyle') return lesson.pedagogicalProfile.style;
  if (key === 'communicationTone') return lesson.pedagogicalProfile.communicationTone;
  return lesson.pedagogicalProfile.focus;
}

export function usePedagogicalProfile(dependencies: PedagogicalProfileDependencies, onLessonVersionChange:(lessonId:string, version:number)=>void) {
  const { lesson, applyGovernance, refreshLesson, refreshMethodology, refreshScenario } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyKey, setBusyKey] = useState<PedagogicalProfileKey | null>(null);

  const recoverMutation = useCallback(async (error:unknown) => {
    return recover(error, error instanceof ApiRequestError && error.status === 409 ? async () => Promise.all([refreshLesson(), refreshMethodology(), refreshScenario()]).then(() => undefined) : undefined);
  }, [recover, refreshLesson, refreshMethodology, refreshScenario]);

  const save = useCallback(async (key:PedagogicalProfileKey, value:PedagogicalProfileValue) => {
    const field = fieldFor(lesson, key);
    setBusyKey(key);
    try {
      const response = await editPedagogicalProfile(api, { lessonId:lesson.id, key, value, expectedLessonVersion:lesson.version, ...(field ? { expectedFieldRevision:field.meta.revision } : {}) });
      applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      notifications.info('Педагогический параметр сохранён как черновик. Теперь утвердите его.');
    } catch (error) { await recoverMutation(error); } finally { setBusyKey(null); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, recoverMutation]);

  const approve = useCallback(async (key:PedagogicalProfileKey) => {
    const field = fieldFor(lesson, key);
    if (!field) return;
    setBusyKey(key);
    try {
      const response = await approvePedagogicalProfile(api, { lessonId:lesson.id, key, expectedLessonVersion:lesson.version, expectedFieldRevision:field.meta.revision });
      applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([refreshMethodology(), refreshScenario()]);
      notifications.success('Педагогический параметр утверждён.');
    } catch (error) { await recoverMutation(error); } finally { setBusyKey(null); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, recoverMutation, refreshMethodology, refreshScenario]);

  return { busyKey, save, approve };
}
