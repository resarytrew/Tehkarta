export interface ApiConfig {
  host: string;
  port: number;
  environment: 'development' | 'test' | 'production';
  allowedOrigins: string[];
  sessionCookieName: string;
  secureCookies: boolean;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 8080);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value ?? ''}`);
  }
  return port;
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

  return {
    host: env.HOST ?? '0.0.0.0',
    port: parsePort(env.PORT),
    environment,
    allowedOrigins,
    sessionCookieName: secureCookies ? '__Host-tehkarta_session' : 'tehkarta_session',
    secureCookies
  };
}
