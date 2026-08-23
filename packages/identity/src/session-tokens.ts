import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
  verifyCsrfToken(rawToken: string, expectedHash: string): boolean;
}

function hash(namespace: string, value: string): string {
  return createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(value)
    .digest('hex');
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
  } catch {
    return false;
  }
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

  verifyCsrfToken(rawToken: string, expectedHash: string): boolean {
    return constantTimeHexEqual(this.hashCsrfToken(rawToken), expectedHash);
  }
}
