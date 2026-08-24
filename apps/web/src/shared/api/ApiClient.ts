import type { ApiErrorPayload } from './contracts.js';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload
  ) {
    super(payload.message ?? `API request failed with status ${status}.`);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  workspaceId: string;
  csrfToken?: string;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = { message: response.statusText || 'Unknown API error.' };
    }
    throw new ApiRequestError(response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ApiClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    options: { csrf?: boolean } = {}
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('x-workspace-id', this.config.workspaceId);
    headers.set('accept', 'application/json');
    if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    if (options.csrf) {
      if (!this.config.csrfToken) {
        throw new ApiRequestError(403, {
          code: 'CSRF_REQUIRED',
          message: 'Для изменения урока нужен CSRF-токен активной сессии.'
        });
      }
      headers.set('x-csrf-token', this.config.csrfToken);
    }
    return parseApiResponse<T>(
      await fetch(`${this.baseUrl}${path}`, { ...init, headers, credentials: 'include' })
    );
  }
}
