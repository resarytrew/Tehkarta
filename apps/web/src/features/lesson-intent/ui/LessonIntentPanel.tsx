import type { CoreDecisionKey } from '../../../entities/lesson/model.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { useAiProposals } from '../../ai-proposals/model/useAiProposals.js';
import { decisionCopy } from '../model/decisionConfig.js';
import { useGovernedDecisions } from '../model/useGovernedDecisions.js';
import { GovernedFieldCard } from './GovernedFieldCard.js';

export function LessonIntentPanel({ workspace, onLessonVersionChange, onNext }: {
  workspace: LessonWorkspace;
  onLessonVersionChange(lessonId: string, version: number): void;
  onNext(): void;
}) {
  const governed = useGovernedDecisions({
    lesson: workspace.lesson,
    applyGovernance: workspace.applyGovernance,
    refreshLesson: workspace.refreshLesson,
    refreshMethodology: workspace.refreshMethodology,
    refreshScenario: workspace.refreshScenario
  }, onLessonVersionChange);
  const ai = useAiProposals({
    lesson: workspace.lesson,
    putProposal: workspace.putProposal,
    applyGovernance: workspace.applyGovernance,
    refreshLesson: workspace.refreshLesson,
    refreshProposals: workspace.refreshProposals,
    refreshMethodology: workspace.refreshMethodology,
    refreshScenario: workspace.refreshScenario
  }, onLessonVersionChange);
  const lesson = workspace.lesson;
  if (!lesson) return null;

  return (
    <>
      <div className="section-intro">
        <span className="eyebrow">Шаг 2 · педагогические решения</span>
        <h2>Цель и смысловая рамка урока</h2>
        <p>AI предлагает формулировки отдельно. Следующие шаги получают только решения, которые педагог явно применил.</p>
      </div>
      {(Object.keys(decisionCopy) as CoreDecisionKey[]).map((semanticKey) => {
        const latestProposal = workspace.proposals.find((proposal) => proposal.semanticKey === semanticKey);
        const applyingCandidateId = latestProposal && ai.applying?.proposalId === latestProposal.id ? ai.applying.candidateId : null;
        return (
          <GovernedFieldCard
            key={semanticKey}
            semanticKey={semanticKey}
            title={decisionCopy[semanticKey].title}
            description={decisionCopy[semanticKey].description}
            field={lesson[semanticKey]}
            busy={governed.busyKey === semanticKey}
            aiBusy={ai.requestingKey === semanticKey}
            latestProposal={latestProposal}
            applyingAiCandidateId={applyingCandidateId}
            onSaveDraft={(value) => governed.saveDraft(semanticKey, value)}
            onApply={(value) => governed.apply(semanticKey, value)}
            onAiAction={ai.request}
            onApplyAiCandidate={ai.applyCandidate}
            onDismissAiProposal={ai.dismiss}
          />
        );
      })}
      <div className="workflow-next-card">
        <div><strong>Следующий шаг использует только утверждённые решения</strong><p>Утверждено смысловых полей: {[lesson.goal, lesson.problemQuestion, lesson.bigIdea].filter((field) => field?.meta.status === 'APPROVED').length}/3.</p></div>
        <button className="button button-primary" type="button" onClick={onNext}>Перейти к методическому конструктору →</button>
      </div>
    </>
  );
}
