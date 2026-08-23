import { useCallback, useState } from 'react';
import { ApiRequestError, loginWithPassword } from './api.js';
import { App } from './App.js';
import { LoginScreen } from './components/LoginScreen.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const WORKSPACE_STORAGE_KEY = 'tehkarta.workspaceId';
const CSRF_STORAGE_KEY = 'tehkarta.csrfToken';

function hasSessionBootstrap(): boolean {
  const workspaceId = (
    window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ??
    import.meta.env.VITE_DEFAULT_WORKSPACE_ID ??
    ''
  ).trim();
  const csrfToken = (
    window.sessionStorage.getItem(CSRF_STORAGE_KEY) ??
    import.meta.env.VITE_DEV_CSRF_TOKEN ??
    ''
  ).trim();
  return Boolean(workspaceId && csrfToken);
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
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
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
