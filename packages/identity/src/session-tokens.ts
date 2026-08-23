import { createHash, randomBytes } from 'node:crypto';

export interface IssuedSessionSecrets {
  sessionToken: string;
  sessionTokenHash: string;
  csrfToken: string;
  csrfTokenHash: string;
}

export interface SessionTokenCodec {
  issue(): IssuedSessionSecrets;
  hashSessionToken(rawToken: string): string;
  hashCsrfToken(rawToken: string): string;
}

function hash(namespace: string, value: string): string {
  return createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(value)
    .digest('hex');
}

export class NodeSessionTokenCodec implements SessionTokenCodec {
  issue(): IssuedSessionSecrets {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');

    return {
      sessionToken,
      sessionTokenHash: this.hashSessionToken(sessionToken),
      csrfToken,
      csrfTokenHash: this.hashCsrfToken(csrfToken)
    };
  }

  hashSessionToken(rawToken: string): string {
    return hash('tehkarta:session:v1', rawToken);
  }

  hashCsrfToken(rawToken: string): string {
    return hash('tehkarta:csrf:v1', rawToken);
  }
}
