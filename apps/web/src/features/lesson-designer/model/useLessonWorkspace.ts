import { useCallback, useEffect, useState } from 'react';
import { getScenarioContext, listDesignArtifacts } from '../../../entities/artifact/api/artifactApi.js';
import type { ApprovedScenarioContext, LessonDesignArtifact } from '../../../entities/artifact/model.js';
import type { LessonContentContext } from '../../../entities/content/model.js';
import { getLesson, listInvalidations } from '../../../entities/lesson/api/lessonApi.js';
import type { GovernanceResponse, Lesson, LessonInvalidation } from '../../../entities/lesson/model.js';
import type { MethodologyRecommendationBundle } from '../../../entities/methodology/model.js';
import type { LessonAiProposal } from '../../../entities/proposal/model.js';
import { listAiProposals } from '../../ai-proposals/api/aiProposalApi.js';
import { getLessonContentContext } from '../../content-selection/api/contentApi.js';
import { getMethodologyRecommendations } from '../../methodology/api/methodologyApi.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';

function proposalFirst(current: LessonAiProposal[], proposal: LessonAiProposal): LessonAiProposal[] {
  return [proposal, ...current.filter((item) => item.id !== proposal.id)];
}

export function useLessonWorkspace(lessonId: string) {
  const api = useApiClient();
  const recover = useApiErrorRecovery();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [invalidations, setInvalidations] = useState<LessonInvalidation[]>([]);
  const [proposals, setProposals] = useState<LessonAiProposal[]>([]);
  const [methodology, setMethodology] = useState<MethodologyRecommendationBundle | null>(null);
  const [contentContext, setContentContext] = useState<LessonContentContext | null>(null);
  const [scenarioContext, setScenarioContext] = useState<ApprovedScenarioContext | null>(null);
  const [artifacts, setArtifacts] = useState<LessonDesignArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextLesson, nextInvalidations, nextProposals, nextMethodology, nextContent, nextScenario, nextArtifacts] = await Promise.all([
        getLesson(api, lessonId),
        listInvalidations(api, lessonId),
        listAiProposals(api, lessonId),
        getMethodologyRecommendations(api, lessonId),
        getLessonContentContext(api, lessonId),
        getScenarioContext(api, lessonId),
        listDesignArtifacts(api, lessonId)
      ]);
      setLesson(nextLesson);
      setInvalidations(nextInvalidations);
      setProposals(nextProposals);
      setMethodology(nextMethodology);
      setContentContext(nextContent);
      setScenarioContext(nextScenario);
      setArtifacts(nextArtifacts);
    } catch (cause) {
      const classified = await recover(cause);
      setError(classified.message);
    } finally { setLoading(false); }
  }, [api, lessonId, recover]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const refreshLesson = useCallback(async () => {
    const [nextLesson, nextInvalidations] = await Promise.all([
      getLesson(api, lessonId),
      listInvalidations(api, lessonId)
    ]);
    setLesson(nextLesson);
    setInvalidations(nextInvalidations);
  }, [api, lessonId]);
  const refreshMethodology = useCallback(async () => {
    setMethodology(await getMethodologyRecommendations(api, lessonId));
  }, [api, lessonId]);
  const refreshProposals = useCallback(async () => {
    setProposals(await listAiProposals(api, lessonId));
  }, [api, lessonId]);
  const refreshContent = useCallback(async () => {
    setContentContext(await getLessonContentContext(api, lessonId));
  }, [api, lessonId]);
  const refreshScenario = useCallback(async () => {
    setScenarioContext(await getScenarioContext(api, lessonId));
  }, [api, lessonId]);
  const refreshArtifacts = useCallback(async () => {
    setArtifacts(await listDesignArtifacts(api, lessonId));
  }, [api, lessonId]);
  const applyGovernance = useCallback((response: GovernanceResponse) => {
    setLesson(response.data);
    setInvalidations(response.invalidations);
  }, []);
  const putProposal = useCallback((proposal: LessonAiProposal) => {
    setProposals((current) => proposalFirst(current, proposal));
  }, []);
  const putArtifact = useCallback((artifact: LessonDesignArtifact) => {
    setArtifacts((current) => [artifact, ...current.filter((item) => item.kind !== artifact.kind)]);
  }, []);

  return {
    lesson,
    invalidations,
    proposals,
    methodology,
    contentContext,
    scenarioContext,
    artifacts,
    loading,
    error,
    refreshAll,
    refreshLesson,
    refreshProposals,
    refreshMethodology,
    refreshContent,
    refreshScenario,
    refreshArtifacts,
    applyGovernance,
    putProposal,
    putArtifact,
    setMethodology,
    setContentContext,
    setScenarioContext
  };
}

export type LessonWorkspace = ReturnType<typeof useLessonWorkspace>;
