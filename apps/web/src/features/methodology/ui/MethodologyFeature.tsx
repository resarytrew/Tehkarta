import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { useMethodology } from '../model/useMethodology.js';
import { MethodologyConstructor } from './MethodologyConstructor.js';

export function MethodologyFeature({ workspace, onLessonVersionChange, onNext }: {
  workspace: LessonWorkspace;
  onLessonVersionChange(lessonId: string, version: number): void;
  onNext(): void;
}) {
  const model = useMethodology({
    lesson: workspace.lesson,
    bundle: workspace.methodology,
    applyGovernance: workspace.applyGovernance,
    refreshLesson: workspace.refreshLesson,
    refreshMethodology: workspace.refreshMethodology,
    refreshScenario: workspace.refreshScenario
  }, onLessonVersionChange);
  if (!workspace.lesson) return null;
  return (
    <MethodologyConstructor
      lesson={workspace.lesson}
      bundle={model.bundle}
      loading={workspace.loading}
      busyRecommendationId={model.busyRecommendationId}
      addingOutcome={model.addingOutcome}
      onAddOutcome={model.addOutcome}
      onUseRecommendation={model.useRecommendation}
      onRejectRecommendation={model.rejectRecommendation}
      onNext={onNext}
    />
  );
}
