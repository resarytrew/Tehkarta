import { useCallback, useState } from 'react';
import type { CoreDecisionKey } from '../../../entities/lesson/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { approveDecision, editDecision } from '../api/governedDecisionApi.js';

export function useGovernedDecisions(workspace: LessonWorkspace, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyKey, setBusyKey] = useState<CoreDecisionKey | null>(null);

  const recoverMutation = useCallback(async (error: unknown) => {
    const classified = await recover(
      error,
      error instanceof ApiRequestError && error.status === 409 ? workspace.refreshLesson : undefined
    );
    throw new Error(classified.message);
  }, [recover, workspace.refreshLesson]);

  const saveDraft = useCallback(async (semanticKey: CoreDecisionKey, value: string) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyKey(semanticKey);
    try {
      const field = lesson[semanticKey];
      if (field && field.value.trim() === value.trim() && field.meta.status === 'EDITED') return;
      const response = await editDecision(api, {
        lessonId: lesson.id,
        semanticKey,
        value,
        expectedLessonVersion: lesson.version,
        ...(field ? { expectedFieldRevision: field.meta.revision } : {})
      });
      workspace.applyGovernance(response);
      onLessonVersionChange(response.data.id, response.data.version);
      notifications.info('Черновик сохранён. Следующие шаги используют только утверждённое решение.');
    } catch (error) { await recoverMutation(error); }
    finally { setBusyKey(null); }
  }, [api, notifications, onLessonVersionChange, recoverMutation, workspace]);

  const apply = useCallback(async (semanticKey: CoreDecisionKey, value: string) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyKey(semanticKey);
    try {
      let workingLesson = lesson;
      let field = workingLesson[semanticKey];
      const normalized = value.trim();
      if (!field || field.value.trim() !== normalized) {
        const edited = await editDecision(api, {
          lessonId: workingLesson.id,
          semanticKey,
          value: normalized,
          expectedLessonVersion: workingLesson.version,
          ...(field ? { expectedFieldRevision: field.meta.revision } : {})
        });
        workspace.applyGovernance(edited);
        workingLesson = edited.data;
        field = workingLesson[semanticKey];
      }
      if (!field) throw new Error('Поле не было создано после сохранения.');
      if (field.meta.status !== 'APPROVED') {
        const approved = await approveDecision(api, {
          lessonId: workingLesson.id,
          semanticKey,
          expectedLessonVersion: workingLesson.version,
          expectedFieldRevision: field.meta.revision
        });
        workspace.applyGovernance(approved);
        workingLesson = approved.data;
      }
      onLessonVersionChange(workingLesson.id, workingLesson.version);
      await Promise.all([workspace.refreshMethodology(), workspace.refreshScenario()]);
      notifications.success('Решение утверждено педагогом и доступно следующим этапам.');
    } catch (error) { await recoverMutation(error); }
    finally { setBusyKey(null); }
  }, [api, notifications, onLessonVersionChange, recoverMutation, workspace]);

  return { busyKey, saveDraft, apply };
}
