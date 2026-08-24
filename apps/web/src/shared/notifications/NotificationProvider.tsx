import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type NotificationTone = 'success' | 'warning' | 'error' | 'info';

interface NotificationState {
  tone: NotificationTone;
  message: string;
}

interface Notifications {
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  info(message: string): void;
  clear(): void;
}

const NotificationContext = createContext<Notifications | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const publish = useCallback((tone: NotificationTone, message: string) => {
    setNotification({ tone, message });
  }, []);
  const value = useMemo<Notifications>(() => ({
    success: (message) => publish('success', message),
    warning: (message) => publish('warning', message),
    error: (message) => publish('error', message),
    info: (message) => publish('info', message),
    clear: () => setNotification(null)
  }), [publish]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notification ? (
        <div className={`notice-toast notice-toast--${notification.tone}`} role="status">
          <span>{notification.message}</span>
          <button type="button" aria-label="Закрыть" onClick={() => setNotification(null)}>×</button>
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): Notifications {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationProvider.');
  return value;
}
