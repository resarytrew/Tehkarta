import { describe, expect, test } from 'vitest';
import { ApiRequestError } from '../api/ApiClient.js';
import { classifyApiError } from './apiErrorPolicy.js';

describe('classifyApiError', () => {
  test('classifies stale and session recovery without message parsing', () => {
    expect(classifyApiError(new ApiRequestError(409, { code: 'STALE_VERSION' })).recovery).toBe('reload-lesson');
    expect(classifyApiError(new ApiRequestError(409, { code: 'DEPENDENCY_STALE' })).kind).toBe('dependency-stale');
    expect(classifyApiError(new ApiRequestError(401, {})).recovery).toBe('reauthenticate');
  });
});
