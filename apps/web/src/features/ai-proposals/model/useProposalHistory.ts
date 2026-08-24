import { useEffect, useState } from 'react';
import type { CoreDecisionKey } from '../../../entities/lesson/model.js';
import type { LessonAiProposal } from '../../../entities/proposal/model.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { listAiProposals } from '../api/aiProposalApi.js';

function proposalFirst(current: LessonAiProposal[], proposal: LessonAiProposal): LessonAiProposal[] {
  return [proposal, ...current.filter((item) => item.id !== proposal.id)];
}

export function useProposalHistory(latestProposal: LessonAiProposal | undefined, semanticKey: CoreDecisionKey) {
  const api = useApiClient();
  const [history, setHistory] = useState<LessonAiProposal[]>(latestProposal ? [latestProposal] : []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latestProposal) { setHistory([]); setError(null); return; }
    let cancelled = false;
    setHistory((current) => proposalFirst(current, latestProposal));
    void listAiProposals(api, latestProposal.lessonId, semanticKey).then((items) => {
      if (!cancelled) { setHistory(items); setError(null); }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить историю AI-предложений.');
    });
    return () => { cancelled = true; };
  }, [api, latestProposal, semanticKey]);

  return { history, error, put: (proposal: LessonAiProposal) => setHistory((current) => proposalFirst(current, proposal)) };
}
