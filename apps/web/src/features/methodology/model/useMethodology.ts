import { useCallback, useState } from 'react';
import type { GovernanceResponse, Lesson } from '../../../entities/lesson/model.js';
import type { MethodologyRecommendation, MethodologyRecommendationBundle } from '../../../entities/methodology/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { addApprovedOutcome, rejectMethodologyRecommendation, useMethodologyRecommendation } from '../api/methodologyApi.js';

export interface MethodologyDependencies {
  lesson: Lesson | null;
  bundle: MethodologyRecommendationBundle | null;
  applyGovernance(response: GovernanceResponse): void;
  refreshLesson(): Promise<void>;
  refreshMethodology(): Promise<void>;
  refreshScenario(): Promise<void>;
}

export function useMethodology(dependencies: MethodologyDependencies, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const { lesson, bundle, applyGovernance, refreshLesson, refreshMethodology, refreshScenario } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);
  const [addingOutcome, setAddingOutcome] = useState(false);

  const recoverMutation = useCallback(async (error: unknown) => {
    return recover(
      error,
      error instanceof ApiRequestError && error.status === 409
        ? async () => Promise.all([refreshLesson(), refreshMethodology(), refreshScenario()]).then(() => undefined)
        : undefined
    );
  }, [recover, refreshLesson, refreshMethodology, refreshScenario]);

  const addOutcome = useCallback(async (value: string) => {
    if (!lesson) return;
    setAddingOutcome(true);
    try {
      const response = await addApprovedOutcome(api, { lessonId: lesson.id, value, expectedLessonVersion: lesson.version });
      applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([refreshMethodology(), refreshScenario()]);
      notifications.success('Результат утверждён педагогом; рекомендации пересчитаны.');
    } catch (error) { await recoverMutation(error); }
    finally { setAddingOutcome(false); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, recoverMutation, refreshMethodology, refreshScenario]);

  const useRecommendation = useCallback(async (recommendation: MethodologyRecommendation, choice: { formId: string; techniqueIds: string[] }) => {
    if (!lesson) return;
    setBusyRecommendationId(recommendation.id);
    try {
      const response = await useMethodologyRecommendation(api, {
        lessonId: lesson.id,
        recommendationId: recommendation.id,
        methodId: recommendation.method.id,
        formId: choice.formId,
        techniqueIds: choice.techniqueIds,
        expectedLessonVersion: lesson.version
      });
      applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([refreshMethodology(), refreshScenario()]);
      notifications.success(`Метод «${recommendation.method.name}» утверждён педагогом.`);
    } catch (error) { await recoverMutation(error); }
    finally { setBusyRecommendationId(null); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, recoverMutation, refreshMethodology, refreshScenario]);

  const rejectRecommendation = useCallback(async (recommendation: MethodologyRecommendation) => {
    if (!lesson) return;
    setBusyRecommendationId(recommendation.id);
    try {
      await rejectMethodologyRecommendation(api, lesson.id, recommendation.id);
      await refreshMethodology();
      notifications.info(`Рекомендация «${recommendation.method.name}» отклонена для текущего контекста.`);
    } catch (error) { await recoverMutation(error); }
    finally { setBusyRecommendationId(null); }
  }, [api, lesson, notifications, recoverMutation, refreshMethodology]);

  return { bundle, busyRecommendationId, addingOutcome, addOutcome, useRecommendation, rejectRecommendation };
}
