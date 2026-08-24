import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyHttpProviderFailure,
  parseRetryAfterMs
} from './provider-errors.js';

test('provider HTTP failures retry only transient classes', () => {
  assert.deepEqual(classifyHttpProviderFailure(401), {
    errorClass: 'AUTHENTICATION',
    retryable: false
  });
  assert.deepEqual(classifyHttpProviderFailure(403), {
    errorClass: 'PERMISSION',
    retryable: false
  });
  assert.deepEqual(classifyHttpProviderFailure(429), {
    errorClass: 'RATE_LIMIT',
    retryable: true
  });
  assert.deepEqual(classifyHttpProviderFailure(503), {
    errorClass: 'UPSTREAM_5XX',
    retryable: true
  });
  assert.deepEqual(classifyHttpProviderFailure(400), {
    errorClass: 'INVALID_REQUEST',
    retryable: false
  });
});

test('retry-after supports seconds and bounded date arithmetic input', () => {
  assert.equal(parseRetryAfterMs('2.5', 1_000), 2_500);
  assert.equal(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 1_000), 4_000);
  assert.equal(parseRetryAfterMs('nonsense', 1_000), undefined);
});
