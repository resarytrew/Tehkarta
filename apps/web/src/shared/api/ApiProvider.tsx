import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ApiClient, type ApiClientConfig } from './ApiClient.js';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ config, children }: { config: ApiClientConfig; children: ReactNode }) {
  const api = useMemo(
    () => new ApiClient(config),
    [config.baseUrl, config.workspaceId, config.csrfToken]
  );
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApiClient(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApiClient must be used inside ApiProvider.');
  return api;
}
