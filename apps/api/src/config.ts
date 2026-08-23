export interface ApiConfig {
  host: string;
  port: number;
  environment: 'development' | 'test' | 'production';
  allowedOrigins: string[];
  sessionCookieName: string;
  secureCookies: boolean;
  sessionTtlSeconds: number;
  authIpHashKey: string;
  trustProxy: boolean;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 8080);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value ?? ''}`);
  }
  return port;
}

function parseSessionTtl(value: string | undefined): number {
  const ttl = Number(value ?? 43_200);
  if (!Number.isInteger(ttl) || ttl < 300 || ttl > 2_592_000) {
    throw new Error('SESSION_TTL_SECONDS must be between 300 and 2592000 seconds.');
  }
  return ttl;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const environment = env.NODE_ENV === 'production'
    ? 'production'
    : env.NODE_ENV === 'test'
      ? 'test'
      : 'development';

  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (environment === 'production' && allowedOrigins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must be explicitly configured in production.');
  }
  if (allowedOrigins.includes('*')) {
    throw new Error('Wildcard CORS origins are forbidden when credential cookies are enabled.');
  }

  const secureCookies = environment === 'production';
  const authIpHashKey = env.AUTH_IP_HASH_KEY ?? (environment === 'production' ? '' : 'tehkarta-local-ip-hash-key-do-not-use-in-production');
  if (environment === 'production' && authIpHashKey.length < 32) {
    throw new Error('AUTH_IP_HASH_KEY must be supplied from a secret store and contain at least 32 characters in production.');
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port: parsePort(env.PORT),
    environment,
    allowedOrigins,
    sessionCookieName: secureCookies ? '__Host-tehkarta_session' : 'tehkarta_session',
    secureCookies,
    sessionTtlSeconds: parseSessionTtl(env.SESSION_TTL_SECONDS),
    authIpHashKey,
    trustProxy: environment === 'production' || env.TRUST_PROXY === 'true'
  };
}
