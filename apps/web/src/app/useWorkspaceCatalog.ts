import { useCallback, useEffect, useState } from 'react';
import { listCourses } from '../entities/course/api/courseApi.js';
import type { CourseSummary } from '../entities/course/model.js';
import type { MeResponse } from '../entities/session/model.js';
import { useApiClient } from '../shared/api/ApiProvider.js';
import { getMe } from '../shared/auth/sessionApi.js';
import { useApiErrorRecovery } from '../shared/errors/useApiErrorRecovery.js';

export function useWorkspaceCatalog() {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [identity, nextCourses] = await Promise.all([getMe(api), listCourses(api)]);
      setMe(identity);
      setCourses(nextCourses);
    } catch (cause) {
      const classified = await recover(cause);
      setError(classified.message);
    } finally {
      setLoading(false);
    }
  }, [api, recover]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { me, courses, loading, error, refresh };
}
