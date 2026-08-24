import { useEffect, useState } from 'react';
import type { LessonAiProposal } from '../../../entities/proposal/model.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { getAiProposal } from '../api/aiProposalApi.js';

const terminalStatuses = new Set<LessonAiProposal['status']>(['READY', 'APPLIED', 'DISMISSED', 'STALE', 'FAILED', 'CANCELLED']);

export function useProposalStatus(proposal: LessonAiProposal) {
  const api = useApiClient();
  const [current, setCurrent] = useState(proposal);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setCurrent(proposal); setError(null); }, [proposal]);
  useEffect(() => {
    if (terminalStatuses.has(current.status)) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = 1_200;
    const poll = async () => {
      try {
        const refreshed = await getAiProposal(api, current.lessonId, current.id);
        if (cancelled) return;
        setCurrent(refreshed);
        setError(null);
        if (terminalStatuses.has(refreshed.status)) return;
        delay = Math.min(Math.round(delay * 1.6), 5_000);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Не удалось обновить статус AI-предложения.');
        delay = Math.min(Math.round(delay * 2), 8_000);
      }
      timer = window.setTimeout(() => void poll(), delay);
    };
    timer = window.setTimeout(() => void poll(), delay);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [api, current.id, current.lessonId, current.status]);

  return { current, setCurrent, pollingError: error };
}
