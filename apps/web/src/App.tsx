import { TeacherWorkspace } from './app/TeacherWorkspace.js';
import { ApiProvider } from './shared/api/ApiProvider.js';
import { SessionActionsProvider } from './shared/auth/SessionActions.js';
import { API_BASE_URL, storedCsrfToken, storedWorkspaceId } from './shared/auth/sessionStorage.js';
import { NotificationProvider } from './shared/notifications/NotificationProvider.js';

export interface AppProps {
  onSessionEnded(): void;
}

export function App({ onSessionEnded }: AppProps) {
  const workspaceId = storedWorkspaceId();
  const csrfToken = storedCsrfToken();
  if (!workspaceId) return null;
  return (
    <ApiProvider config={{ baseUrl: API_BASE_URL, workspaceId, ...(csrfToken ? { csrfToken } : {}) }}>
      <SessionActionsProvider onSessionEnded={onSessionEnded}>
        <NotificationProvider>
          <TeacherWorkspace />
        </NotificationProvider>
      </SessionActionsProvider>
    </ApiProvider>
  );
}
