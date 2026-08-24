import { useCallback, useState } from 'react';
import type { ContentSelectionDecision, LessonContentContext, LessonUmkEvidenceItem } from '../../../entities/content/model.js';
import type { GovernanceResponse, Lesson } from '../../../entities/lesson/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { setUmkContentDecision } from '../api/contentApi.js';

export interface ContentSelectionDependencies {
  lesson: Lesson | null;
  context: LessonContentContext | null;
  applyGovernance(response: GovernanceResponse): void;
  setContentContext(context: LessonContentContext): void;
  refreshLesson(): Promise<void>;
  refreshContent(): Promise<void>;
  refreshScenario(): Promise<void>;
}

export function useContentSelection(dependencies: ContentSelectionDependencies, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const { lesson, context, applyGovernance, setContentContext, refreshLesson, refreshContent, refreshScenario } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyMappingId, setBusyMappingId] = useState<string | null>(null);

  const setDecision = useCallback(async (item: LessonUmkEvidenceItem, decision: ContentSelectionDecision) => {
    if (!lesson) return;
    setBusyMappingId(item.mappingId);
    try {
      const response = await setUmkContentDecision(api, {
        lessonId: lesson.id,
        mappingId: item.mappingId,
        decision,
        expectedLessonVersion: lesson.version
      });
      applyGovernance(response);
      setContentContext(response.contentContext);
      onLessonVersionChange(response.data.id, response.data.version);
      await refreshScenario();
      if (!response.changed) notifications.info('Это решение уже зафиксировано; версия урока не изменена.');
      else if (decision === 'INCLUDED') notifications.success(`Материал «${item.title}» включён педагогом.`);
      else notifications.info(`Материал «${item.title}» исключён; решение сохранено в истории.`);
    } catch (error) {
      await recover(
        error,
        error instanceof ApiRequestError && error.status === 409
          ? async () => Promise.all([refreshLesson(), refreshContent(), refreshScenario()]).then(() => undefined)
          : undefined
      );
    } finally { setBusyMappingId(null); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, recover, refreshContent, refreshLesson, refreshScenario, setContentContext]);

  return { context, busyMappingId, setDecision };
}
