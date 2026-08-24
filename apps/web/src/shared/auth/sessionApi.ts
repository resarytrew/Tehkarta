import type { LoginResponse, MeResponse } from '../../entities/session/model.js';
import { ApiClient, normalizeBaseUrl, parseApiResponse } from '../api/ApiClient.js';

export async function loginWithPassword(
  baseUrl: string,
  input: { email: string; password: string }
): Promise<LoginResponse> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return parseApiResponse<LoginResponse>(response);
}

export function getMe(api: ApiClient): Promise<MeResponse> {
  return api.request<MeResponse>('/api/v1/me');
}

export function logout(api: ApiClient): Promise<void> {
  return api.request<void>('/api/v1/auth/logout', { method: 'POST' }, { csrf: true });
}
