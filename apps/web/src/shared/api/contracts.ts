export interface ApiData<T> {
  data: T;
}

export interface ApiErrorPayload {
  error?: string;
  code?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  requestId?: string;
}
