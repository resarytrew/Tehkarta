import { AuthenticationError } from './index.js';

export type LoginThrottleScope = 'PRINCIPAL' | 'IP';

export interface LoginThrottlePolicy {
  windowSeconds: number;
  maxFailures: number;
  blockSeconds: number;
}

export interface LoginThrottleState {
  scope: LoginThrottleScope;
  keyHash: string;
  windowStartedAt: string;
  failureCount: number;
  blockedUntil: string | null;
}

export interface LoginThrottleRepository {
  get(scope: LoginThrottleScope, keyHash: string): Promise<LoginThrottleState | null>;
  recordFailure(input: {
    scope: LoginThrottleScope;
    keyHash: string;
    at: string;
    policy: LoginThrottlePolicy;
  }): Promise<LoginThrottleState>;
  clear(scope: LoginThrottleScope, keyHash: string): Promise<void>;
}

export interface LoginThrottleKeys {
  principalHash: string;
  ipHash: string;
}

export interface LoginThrottleServiceOptions {
  principal?: Partial<LoginThrottlePolicy>;
  ip?: Partial<LoginThrottlePolicy>;
}

const DEFAULT_PRINCIPAL_POLICY: LoginThrottlePolicy = {
  windowSeconds: 15 * 60,
  maxFailures: 8,
  blockSeconds: 15 * 60
};

const DEFAULT_IP_POLICY: LoginThrottlePolicy = {
  windowSeconds: 15 * 60,
  maxFailures: 30,
  blockSeconds: 15 * 60
};

function policyWithDefaults(
  defaults: LoginThrottlePolicy,
  override: Partial<LoginThrottlePolicy> | undefined
): LoginThrottlePolicy {
  return {
    windowSeconds: override?.windowSeconds ?? defaults.windowSeconds,
    maxFailures: override?.maxFailures ?? defaults.maxFailures,
    blockSeconds: override?.blockSeconds ?? defaults.blockSeconds
  };
}

function assertPolicy(policy: LoginThrottlePolicy): void {
  if (
    !Number.isInteger(policy.windowSeconds) ||
    !Number.isInteger(policy.maxFailures) ||
    !Number.isInteger(policy.blockSeconds) ||
    policy.windowSeconds < 1 ||
    policy.maxFailures < 1 ||
    policy.blockSeconds < 1
  ) {
    throw new Error('Login throttle policy values must be positive integers.');
  }
}

export class LoginThrottleService {
  private readonly principalPolicy: LoginThrottlePolicy;
  private readonly ipPolicy: LoginThrottlePolicy;

  constructor(
    private readonly repository: LoginThrottleRepository,
    options: LoginThrottleServiceOptions = {}
  ) {
    this.principalPolicy = policyWithDefaults(DEFAULT_PRINCIPAL_POLICY, options.principal);
    this.ipPolicy = policyWithDefaults(DEFAULT_IP_POLICY, options.ip);
    assertPolicy(this.principalPolicy);
    assertPolicy(this.ipPolicy);
  }

  async assertAllowed(keys: LoginThrottleKeys, now: Date): Promise<void> {
    const states = await Promise.all([
      this.repository.get('PRINCIPAL', keys.principalHash),
      this.repository.get('IP', keys.ipHash)
    ]);

    const nowMs = now.getTime();
    if (
      states.some(
        (state) => state?.blockedUntil && new Date(state.blockedUntil).getTime() > nowMs
      )
    ) {
      throw new AuthenticationError('RATE_LIMITED');
    }
  }

  async recordFailure(keys: LoginThrottleKeys, now: Date): Promise<void> {
    const at = now.toISOString();
    const [principal, ip] = await Promise.all([
      this.repository.recordFailure({
        scope: 'PRINCIPAL',
        keyHash: keys.principalHash,
        at,
        policy: this.principalPolicy
      }),
      this.repository.recordFailure({
        scope: 'IP',
        keyHash: keys.ipHash,
        at,
        policy: this.ipPolicy
      })
    ]);

    const nowMs = now.getTime();
    if (
      [principal, ip].some(
        (state) => state.blockedUntil && new Date(state.blockedUntil).getTime() > nowMs
      )
    ) {
      throw new AuthenticationError('RATE_LIMITED');
    }
  }

  async recordSuccess(keys: LoginThrottleKeys): Promise<void> {
    // A successful login proves the principal credential, so its account-level
    // counter can be reset. The IP counter intentionally remains: otherwise one
    // valid account could be used to continuously reset an abusive IP source.
    await this.repository.clear('PRINCIPAL', keys.principalHash);
  }
}
