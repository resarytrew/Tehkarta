import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { TestProviders } from '../../test/fixtures.js';
import { ApiRequestError } from '../api/ApiClient.js';
import { useApiErrorRecovery } from './useApiErrorRecovery.js';

test('session expiry ends the local session', async () => {
  const onSessionEnded = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <TestProviders onSessionEnded={onSessionEnded}>{children}</TestProviders>;
  const { result } = renderHook(useApiErrorRecovery, { wrapper });
  await act(() => result.current(new ApiRequestError(401, { code: 'SESSION_EXPIRED' })));
  expect(onSessionEnded).toHaveBeenCalledOnce();
});

test('failed stale refresh reports that recovery did not complete', async () => {
  const { result } = renderHook(useApiErrorRecovery, { wrapper: TestProviders });
  const refresh = vi.fn(async () => { throw new TypeError('offline'); });
  let recovered: Awaited<ReturnType<ReturnType<typeof useApiErrorRecovery>>> | undefined;
  await act(async () => {
    recovered = await result.current(new ApiRequestError(409, { code: 'DEPENDENCY_STALE' }), refresh);
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(recovered?.message).toContain('Автоматическое обновление не удалось');
});
