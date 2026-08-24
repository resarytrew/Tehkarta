import { useCallback, useState } from 'react';
import type { MethodologyRecommendation } from '../../../entities/methodology/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { addApprovedOutcome, rejectMethodologyRecommendation, useMethodologyRecommendation } from '../api/methodologyApi.js';

export function useMethodology(workspace: LessonWorkspace, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);
  const [addingOutcome, setAddingOutcome] = useState(false);

  const recoverMutation = useCallback(async (error: unknown) => {
    return recover(error, error instanceof ApiRequestError && error.status === 409 ? workspace.refreshLesson : undefined);
  }, [recover, workspace.refreshLesson]);

  const addOutcome = useCallback(async (value: string) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setAddingOutcome(true);
    try {
      const response = await addApprovedOutcome(api, { lessonId: lesson.id, value, expectedLessonVersion: lesson.version });
      workspace.applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([workspace.refreshMethodology(), workspace.refreshScenario()]);
      notifications.success('Результат утверждён педагогом; рекомендации пересчитаны.');
    } catch (error) { await recoverMutation(error); }
    finally { setAddingOutcome(false); }
  }, [api, notifications, onLessonVersionChange, recoverMutation, workspace]);

  const useRecommendation = useCallback(async (recommendation: MethodologyRecommendation, choice: { formId: string; techniqueIds: string[] }) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyRecommendationId(recommendation.id);
    try {
      const response = await useMethodologyRecommendation(api, {
        lessonId: lesson.id,
        recommendationId: recommendation.id,
        formId: choice.formId,
        techniqueIds: choice.techniqueIds,
        expectedLessonVersion: lesson.version
      });
      workspace.applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([workspace.refreshMethodology(), workspace.refreshScenario()]);
      notifications.success(`Метод «${recommendation.method.name}» утверждён педагогом.`);
    } catch (error) { await recoverMutation(error); }
    finally { setBusyRecommendationId(null); }
  }, [api, notifications, onLessonVersionChange, recoverMutation, workspace]);

  const rejectRecommendation = useCallback(async (recommendation: MethodologyRecommendation) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyRecommendationId(recommendation.id);
    try {
      await rejectMethodologyRecommendation(api, lesson.id, recommendation.id);
      await workspace.refreshMethodology();
      notifications.info(`Рекомендация «${recommendation.method.name}» отклонена для текущего контекста.`);
    } catch (error) { await recoverMutation(error); }
    finally { setBusyRecommendationId(null); }
  }, [api, notifications, recoverMutation, workspace]);

  return { bundle: workspace.methodology, busyRecommendationId, addingOutcome, addOutcome, useRecommendation, rejectRecommendation };
}
