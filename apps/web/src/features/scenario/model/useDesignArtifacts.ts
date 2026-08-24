import { useCallback, useState } from 'react';
import type { LessonDesignArtifact, LessonDesignArtifactKind } from '../../../entities/artifact/model.js';
import { saveDesignArtifact } from '../../../entities/artifact/api/artifactApi.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';

export interface DesignArtifactDependencies {
  lesson: Lesson | null;
  artifacts: LessonDesignArtifact[];
  putArtifact(artifact: LessonDesignArtifact): void;
  refreshLesson(): Promise<void>;
  refreshScenario(): Promise<void>;
  refreshArtifacts(): Promise<void>;
}

export function useDesignArtifacts(dependencies: DesignArtifactDependencies) {
  const { lesson, artifacts, putArtifact, refreshLesson, refreshScenario, refreshArtifacts } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [busyKind, setBusyKind] = useState<LessonDesignArtifactKind | null>(null);

  const save = useCallback(async (kind: LessonDesignArtifactKind, payload: Record<string, unknown>) => {
    if (!lesson) return;
    setBusyKind(kind);
    try {
      const current = artifacts.find((item) => item.kind === kind);
      const saved = await saveDesignArtifact(api, {
        lessonId: lesson.id,
        kind,
        expectedLessonVersion: lesson.version,
        expectedRevision: current?.revision ?? 0,
        payload
      });
      putArtifact(saved);
      notifications.success(kind === 'SCENARIO' ? 'Сценарий сохранён.' : 'Комплект материалов сохранён.');
    } catch (error) {
      const classified = await recover(
        error,
        error instanceof ApiRequestError && error.status === 409
          ? async () => Promise.all([refreshLesson(), refreshScenario(), refreshArtifacts()]).then(() => undefined)
          : undefined
      );
      throw new Error(classified.message);
    } finally { setBusyKind(null); }
  }, [api, artifacts, lesson, notifications, putArtifact, recover, refreshArtifacts, refreshLesson, refreshScenario]);

  return { artifacts, busyKind, save };
}
