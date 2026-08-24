import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { useContentSelection } from '../model/useContentSelection.js';
import { ContentContextPanel } from './ContentContextPanel.js';

export function ContentSelectionFeature({ workspace, onLessonVersionChange, onNext }: {
  workspace: LessonWorkspace;
  onLessonVersionChange(lessonId: string, version: number): void;
  onNext(): void;
}) {
  const model = useContentSelection({
    lesson: workspace.lesson,
    context: workspace.contentContext,
    applyGovernance: workspace.applyGovernance,
    setContentContext: workspace.setContentContext,
    refreshLesson: workspace.refreshLesson,
    refreshContent: workspace.refreshContent,
    refreshScenario: workspace.refreshScenario
  }, onLessonVersionChange);
  return (
    <ContentContextPanel
      context={model.context}
      loading={workspace.loading}
      busyMappingId={model.busyMappingId}
      onSetUmkDecision={model.setDecision}
      onNext={onNext}
    />
  );
}
