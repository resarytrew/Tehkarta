import { useCallback, useState } from 'react';
import type { CoreDecisionKey, GovernanceResponse, Lesson } from '../../../entities/lesson/model.js';
import type { AiProposalAction, LessonAiProposal } from '../../../entities/proposal/model.js';
import { ApiRequestError } from '../../../shared/api/ApiClient.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { applyAiProposalCandidate, dismissAiProposal, requestAiProposal } from '../api/aiProposalApi.js';

export type AiFieldAction = 'variants' | 'regenerate' | 'improve';

export interface AiProposalDependencies {
  lesson: Lesson | null;
  putProposal(proposal: LessonAiProposal): void;
  applyGovernance(response: GovernanceResponse): void;
  refreshLesson(): Promise<void>;
  refreshProposals(): Promise<void>;
  refreshMethodology(): Promise<void>;
  refreshScenario(): Promise<void>;
}

const actionMap: Record<AiFieldAction, AiProposalAction> = {
  variants: 'VARIANTS', regenerate: 'REGENERATE', improve: 'IMPROVE'
};

export function useAiProposals(dependencies: AiProposalDependencies, onLessonVersionChange: (lessonId: string, version: number) => void) {
  const { lesson, putProposal, applyGovernance, refreshLesson, refreshProposals, refreshMethodology, refreshScenario } = dependencies;
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const notifications = useNotifications();
  const [requestingKey, setRequestingKey] = useState<CoreDecisionKey | null>(null);
  const [applying, setApplying] = useState<{ proposalId: string; candidateId: string } | null>(null);

  const recoverMutation = useCallback(async (error: unknown) => {
    const classified = await recover(
      error,
      error instanceof ApiRequestError && error.status === 409
        ? async () => Promise.all([refreshLesson(), refreshProposals()]).then(() => undefined)
        : undefined
    );
    throw new Error(classified.message);
  }, [recover, refreshLesson, refreshProposals]);

  const request = useCallback(async (action: AiFieldAction, semanticKey: CoreDecisionKey) => {
    if (!lesson) return;
    setRequestingKey(semanticKey);
    try {
      const proposal = await requestAiProposal(api, {
        lessonId: lesson.id,
        semanticKey,
        action: actionMap[action],
        expectedLessonVersion: lesson.version,
        requestKey: `web-${crypto.randomUUID()}`,
        candidateCount: action === 'variants' ? 3 : 1
      });
      putProposal(proposal);
      notifications.info('AI-запрос поставлен в очередь. Утверждённое решение не изменилось.');
    } catch (error) { await recoverMutation(error); }
    finally { setRequestingKey(null); }
  }, [api, lesson, notifications, putProposal, recoverMutation]);

  const applyCandidate = useCallback(async (proposalId: string, candidateId: string) => {
    if (!lesson) return;
    setApplying({ proposalId, candidateId });
    try {
      const response = await applyAiProposalCandidate(api, {
        lessonId: lesson.id,
        proposalId,
        candidateId,
        expectedLessonVersion: lesson.version
      });
      applyGovernance(response);
      putProposal(response.proposal);
      onLessonVersionChange(response.data.id, response.data.version);
      await Promise.all([refreshMethodology(), refreshScenario()]);
      notifications.success('AI-вариант явно применён педагогом; provenance сохранён.');
    } catch (error) { await recoverMutation(error); }
    finally { setApplying(null); }
  }, [api, applyGovernance, lesson, notifications, onLessonVersionChange, putProposal, recoverMutation, refreshMethodology, refreshScenario]);

  const dismiss = useCallback(async (proposal: LessonAiProposal) => {
    try {
      const dismissed = await dismissAiProposal(api, proposal.lessonId, proposal.id);
      putProposal(dismissed);
      notifications.info('AI-предложение отклонено педагогом.');
      return dismissed;
    } catch (error) {
      await recoverMutation(error);
      throw error;
    }
  }, [api, notifications, putProposal, recoverMutation]);

  return { requestingKey, applying, request, applyCandidate, dismiss };
}
