export type AIProviderErrorClass =
  | 'AUTHENTICATION'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM_5XX'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export interface AIProviderErrorOptions {
  provider: string;
  model: string;
  errorClass: AIProviderErrorClass;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  requestId?: string;
  latencyMs?: number;
  cause?: unknown;
}

/**
 * Safe, provider-neutral failure surfaced by infrastructure adapters.
 * The message intentionally never contains the remote response body, prompt,
 * API key, or lesson content. Operational diagnostics belong in metadata.
 */
export class AIProviderError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly errorClass: AIProviderErrorClass;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly requestId: string | undefined;
  readonly latencyMs: number | undefined;

  constructor(message: string, options: AIProviderErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AIProviderError';
    this.provider = options.provider;
    this.model = options.model;
    this.errorClass = options.errorClass;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
    this.latencyMs = options.latencyMs;
  }
}

export function classifyHttpProviderFailure(statusCode: number): {
  errorClass: AIProviderErrorClass;
  retryable: boolean;
} {
  if (statusCode === 401) return { errorClass: 'AUTHENTICATION', retryable: false };
  if (statusCode === 403) return { errorClass: 'PERMISSION', retryable: false };
  if (statusCode === 408 || statusCode === 504) {
    return { errorClass: 'TIMEOUT', retryable: true };
  }
  if (statusCode === 429) return { errorClass: 'RATE_LIMIT', retryable: true };
  if (statusCode >= 500) return { errorClass: 'UPSTREAM_5XX', retryable: true };
  if (statusCode >= 400) return { errorClass: 'INVALID_REQUEST', retryable: false };
  return { errorClass: 'UNKNOWN', retryable: false };
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);

  const absolute = Date.parse(value);
  if (!Number.isFinite(absolute)) return undefined;
  return Math.max(0, absolute - nowMs);
}

export function isTimeoutLikeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
