import { useCallback, useState } from 'react';
import type { LessonDesignArtifactKind } from '../../../entities/artifact/model.js';
import { saveDesignArtifact } from '../../../entities/artifact/api/artifactApi.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';

export function useDesignArtifacts(workspace: LessonWorkspace) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyKind, setBusyKind] = useState<LessonDesignArtifactKind | null>(null);

  const save = useCallback(async (kind: LessonDesignArtifactKind, payload: Record<string, unknown>) => {
    const lesson = workspace.lesson;
    if (!lesson) return;
    setBusyKind(kind);
    try {
      const current = workspace.artifacts.find((item) => item.kind === kind);
      const saved = await saveDesignArtifact(api, {
        lessonId: lesson.id,
        kind,
        expectedLessonVersion: lesson.version,
        expectedRevision: current?.revision ?? 0,
        payload
      });
      workspace.putArtifact(saved);
      notifications.success(kind === 'SCENARIO' ? 'Сценарий сохранён.' : 'Комплект материалов сохранён.');
    } catch (error) {
      const classified = await recover(error, error instanceof ApiRequestError && error.status === 409 ? workspace.refreshAll : undefined);
      throw new Error(classified.message);
    } finally { setBusyKind(null); }
  }, [api, notifications, recover, workspace]);

  return { artifacts: workspace.artifacts, busyKind, save };
}
