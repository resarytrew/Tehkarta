export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
export const WORKSPACE_STORAGE_KEY = 'tehkarta.workspaceId';
export const CSRF_STORAGE_KEY = 'tehkarta.csrfToken';

export function storedWorkspaceId(): string {
  return (
    window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ??
    import.meta.env.VITE_DEFAULT_WORKSPACE_ID ??
    ''
  ).trim();
}

export function storedCsrfToken(): string {
  return (
    window.sessionStorage.getItem(CSRF_STORAGE_KEY) ??
    import.meta.env.VITE_DEV_CSRF_TOKEN ??
    ''
  ).trim();
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
}
