import { useCallback, useState } from 'react';
import { ApiRequestError } from './shared/api/ApiClient.js';
import { loginWithPassword } from './shared/auth/sessionApi.js';
import { App } from './App.js';
import { LoginScreen } from './shared/auth/ui/LoginScreen.js';
import { API_BASE_URL, clearStoredSession, CSRF_STORAGE_KEY, storedCsrfToken, storedWorkspaceId, WORKSPACE_STORAGE_KEY } from './shared/auth/sessionStorage.js';

function hasSessionBootstrap(): boolean {
  return Boolean(storedWorkspaceId() && storedCsrfToken());
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Неверный email или пароль.';
    if (error.status === 429) return 'Слишком много попыток входа. Повторите позже.';
    return error.message || 'Не удалось выполнить вход.';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить вход.';
}

export function AuthGate() {
  const [connected, setConnected] = useState(hasSessionBootstrap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endSession = useCallback(() => {
    clearStoredSession();
    setConnected(false);
    setError(null);
  }, []);

  async function login(email: string, password: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await loginWithPassword(API_BASE_URL, { email, password });
      const preferredWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      const membership =
        result.memberships.find((item) => item.workspaceId === preferredWorkspace) ??
        result.memberships[0];

      if (!membership) {
        throw new Error('Для учётной записи пока не назначена рабочая область.');
      }

      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, membership.workspaceId);
      window.sessionStorage.setItem(CSRF_STORAGE_KEY, result.csrfToken);
      setConnected(true);
    } catch (loginError) {
      const message = loginErrorMessage(loginError);
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return <LoginScreen busy={busy} error={error} onLogin={login} />;
  }

  return <App onSessionEnded={endSession} />;
}
