import { useCallback } from 'react';
import { useSessionActions } from '../auth/SessionActions.js';
import { useNotifications } from '../notifications/NotificationProvider.js';
import { classifyApiError } from './apiErrorPolicy.js';

export function useApiErrorRecovery() {
  const session = useSessionActions();
  const notifications = useNotifications();

  return useCallback(async (error: unknown, reload?: () => Promise<void>) => {
    const classified = classifyApiError(error);
    if (classified.recovery === 'reauthenticate') {
      session.endSession();
      return classified;
    }
    if (classified.recovery === 'reload-lesson' && reload) {
      try {
        await reload();
        notifications.warning(`${classified.message} Актуальные зависимые данные загружены.`);
        return classified;
      } catch (reloadError) {
        const reloadFailure = classifyApiError(reloadError);
        const failedRecovery = {
          ...classified,
          message: `${classified.message} Автоматическое обновление не удалось: ${reloadFailure.message}`
        };
        notifications.error(failedRecovery.message);
        return failedRecovery;
      }
    }
    notifications.error(classified.message);
    return classified;
  }, [notifications, session]);
}
