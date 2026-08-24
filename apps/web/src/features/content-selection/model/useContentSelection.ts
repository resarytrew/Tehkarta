import { useCallback, useState } from 'react';
import type { ContentSelectionDecision, LessonUmkEvidenceItem } from '../../../entities/content/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { setUmkContentDecision } from '../api/contentApi.js';

export function useContentSelection(workspace: LessonWorkspace, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyMappingId, setBusyMappingId] = useState<string | null>(null);

  const setDecision = useCallback(async (item: LessonUmkEvidenceItem, decision: ContentSelectionDecision) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyMappingId(item.mappingId);
    try {
      const response = await setUmkContentDecision(api, {
        lessonId: lesson.id,
        mappingId: item.mappingId,
        decision,
        expectedLessonVersion: lesson.version
      });
      workspace.applyGovernance(response);
      workspace.setContentContext(response.contentContext);
      onLessonVersionChange(response.data.id, response.data.version);
      await workspace.refreshScenario();
      if (!response.changed) notifications.info('Это решение уже зафиксировано; версия урока не изменена.');
      else if (decision === 'INCLUDED') notifications.success(`Материал «${item.title}» включён педагогом.`);
      else notifications.info(`Материал «${item.title}» исключён; решение сохранено в истории.`);
    } catch (error) {
      await recover(error, error instanceof ApiRequestError && error.status === 409 ? workspace.refreshLesson : undefined);
    } finally { setBusyMappingId(null); }
  }, [api, notifications, onLessonVersionChange, recover, workspace]);

  return { context: workspace.contentContext, busyMappingId, setDecision };
}
