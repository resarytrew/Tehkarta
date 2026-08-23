import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordVerifier } from './index.js';

export interface PasswordHasher extends PasswordVerifier {
  hash(password: string): Promise<string>;
}

export interface Argon2idPasswordOptions {
  memoryCostKiB?: number;
  timeCost?: number;
  parallelism?: number;
  outputLen?: number;
}

/**
 * Central password primitive for Tehkarta.
 *
 * Keep the parameters explicit and versioned in code. Existing PHC strings contain
 * their own parameters, so strengthening defaults later does not invalidate stored
 * credentials; a future login flow can rehash after successful verification.
 */
export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly options: Required<Argon2idPasswordOptions>;

  constructor(options: Argon2idPasswordOptions = {}) {
    this.options = {
      memoryCostKiB: options.memoryCostKiB ?? 19_456,
      timeCost: options.timeCost ?? 2,
      parallelism: options.parallelism ?? 1,
      outputLen: options.outputLen ?? 32
    };
  }

  async hash(password: string): Promise<string> {
    if (password.length === 0) throw new Error('Password must not be empty.');

    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: this.options.memoryCostKiB,
      timeCost: this.options.timeCost,
      parallelism: this.options.parallelism,
      outputLen: this.options.outputLen
    });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Corrupted/unsupported hashes must never turn into an authentication bypass
      // or an internal-error oracle.
      return false;
    }
  }
}
