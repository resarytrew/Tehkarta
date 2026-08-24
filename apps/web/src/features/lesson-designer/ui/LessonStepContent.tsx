import type { Course } from '../../../entities/course/model.js';
import type { useLessonExpertise } from '../../expertise/model/useLessonExpertise.js';
import { LessonExpertise } from '../../expertise/ui/LessonExpertise.js';
import { IntentOverview } from '../../lesson-intent/ui/IntentOverview.js';
import { LessonIntentPanel } from '../../lesson-intent/ui/LessonIntentPanel.js';
import type { ActiveDesignStep } from '../../lesson-workflow/model/steps.js';
import { LessonMap } from '../../lesson-map/ui/LessonMap.js';
import type { useMaterials } from '../../materials/model/useMaterials.js';
import { MaterialsEditor } from '../../materials/ui/MaterialsEditor.js';
import { ContentSelectionFeature } from '../../content-selection/ui/ContentSelectionFeature.js';
import { MethodologyFeature } from '../../methodology/ui/MethodologyFeature.js';
import type { useScenario } from '../../scenario/model/useScenario.js';
import { ScenarioEditor } from '../../scenario/ui/ScenarioEditor.js';
import type { useDesignArtifacts } from '../../scenario/model/useDesignArtifacts.js';
import type { LessonWorkspace } from '../model/useLessonWorkspace.js';

export function LessonStepContent({ step, workspace, course, artifacts, scenario, materials, expertise, onLessonVersionChange, goTo }: {
  step: ActiveDesignStep;
  workspace: LessonWorkspace;
  course: Course | null;
  artifacts: ReturnType<typeof useDesignArtifacts>;
  scenario: ReturnType<typeof useScenario>;
  materials: ReturnType<typeof useMaterials>;
  expertise: ReturnType<typeof useLessonExpertise>;
  onLessonVersionChange(lessonId: string, version: number): void;
  goTo(step: ActiveDesignStep): void;
}) {
  const lesson = workspace.lesson;
  if (!lesson) return null;
  switch (step) {
    case 1: return <IntentOverview lesson={lesson} course={course} context={workspace.scenarioContext} onNext={() => goTo(2)} />;
    case 2: return <LessonIntentPanel workspace={workspace} onLessonVersionChange={onLessonVersionChange} onNext={() => goTo(3)} />;
    case 3: return <MethodologyFeature workspace={workspace} onLessonVersionChange={onLessonVersionChange} onNext={() => goTo(4)} />;
    case 4: return <ContentSelectionFeature workspace={workspace} onLessonVersionChange={onLessonVersionChange} onNext={() => goTo(5)} />;
    case 5: return <ScenarioEditor lesson={lesson} context={workspace.scenarioContext} model={scenario} busyKind={artifacts.busyKind} onNext={() => goTo(6)} />;
    case 6: return <MaterialsEditor model={materials} busyKind={artifacts.busyKind} onNext={() => goTo(7)} />;
    case 7: return <LessonExpertise expertise={expertise} onNext={() => goTo(8)} />;
    case 8: return <LessonMap lesson={lesson} context={workspace.scenarioContext} stages={scenario.stages} materials={materials.items} checks={expertise.checks} onFinish={() => goTo(1)} />;
  }
}
