import { useCallback } from 'react';
import type { Course } from '../../../entities/course/model.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useLessonExpertise } from '../../expertise/model/useLessonExpertise.js';
import { useLessonWorkflow } from '../../lesson-workflow/model/useLessonWorkflow.js';
import { stepRefreshDependencies, type ActiveDesignStep } from '../../lesson-workflow/model/steps.js';
import { LessonStepNavigation } from '../../lesson-workflow/ui/LessonStepNavigation.js';
import { useMaterials } from '../../materials/model/useMaterials.js';
import { useDesignArtifacts } from '../../scenario/model/useDesignArtifacts.js';
import { useScenario } from '../../scenario/model/useScenario.js';
import { useLessonWorkspace } from '../model/useLessonWorkspace.js';
import { LessonContextSidebar } from './LessonContextSidebar.js';
import { LessonHeading } from './LessonHeading.js';
import { LessonStepContent } from './LessonStepContent.js';
import '../../lesson-workflow/ui/workflow.css';
import './lesson-designer.css';

export function LessonDesigner({ lessonId, course, onLessonVersionChange }: {
  lessonId: string;
  course: Course | null;
  onLessonVersionChange(lessonId: string, version: number): void;
}) {
  const workspace = useLessonWorkspace(lessonId);
  const recover = useApiErrorRecovery();
  const artifactActions = useDesignArtifacts({
    lesson: workspace.lesson,
    artifacts: workspace.artifacts,
    putArtifact: workspace.putArtifact,
    refreshLesson: workspace.refreshLesson,
    refreshScenario: workspace.refreshScenario,
    refreshArtifacts: workspace.refreshArtifacts
  });
  const scenario = useScenario({
    lesson: workspace.lesson,
    context: workspace.scenarioContext,
    artifacts: workspace.artifacts,
    saveArtifact: artifactActions.save
  });
  const materials = useMaterials({
    lesson: workspace.lesson,
    context: workspace.scenarioContext,
    artifacts: workspace.artifacts,
    scenario,
    saveArtifact: artifactActions.save
  });
  const expertise = useLessonExpertise({ lesson: workspace.lesson, context: workspace.scenarioContext, scenario, materials });
  const onEnter = useCallback(async (step: ActiveDesignStep) => {
    const resources = stepRefreshDependencies[step];
    const refreshes: Promise<void>[] = [];
    if (resources.includes('lesson')) refreshes.push(workspace.refreshLesson());
    if (resources.includes('proposals')) refreshes.push(workspace.refreshProposals());
    if (resources.includes('methodology')) refreshes.push(workspace.refreshMethodology());
    if (resources.includes('content')) refreshes.push(workspace.refreshContent());
    if (resources.includes('scenario')) refreshes.push(workspace.refreshScenario());
    if (resources.includes('artifacts')) refreshes.push(workspace.refreshArtifacts());
    try {
      await Promise.all(refreshes);
    } catch (error) { await recover(error); }
  }, [recover, workspace.refreshArtifacts, workspace.refreshContent, workspace.refreshLesson, workspace.refreshMethodology, workspace.refreshProposals, workspace.refreshScenario]);
  const workflow = useLessonWorkflow({
    lesson: workspace.lesson,
    content: workspace.contentContext,
    context: workspace.scenarioContext,
    artifacts: workspace.artifacts,
    expertiseReady: expertise.isReady
  }, onEnter);

  if (workspace.loading && !workspace.lesson) return <div className="lesson-designer-skeleton" aria-label="Загрузка урока"><div /><div /><div /></div>;
  if (workspace.error && !workspace.lesson) return <div className="page-error">{workspace.error}</div>;
  if (!workspace.lesson) return null;

  return (
    <>
      <LessonHeading course={course} lesson={workspace.lesson} />
      <LessonStepNavigation workflow={workflow} />
      <div className={`workspace-grid ${workflow.activeStep !== 2 ? 'workspace-grid--methodology' : ''}`}>
        <section className="workspace-main-column">
          <LessonStepContent
            step={workflow.activeStep}
            workspace={workspace}
            course={course}
            artifacts={artifactActions}
            scenario={scenario}
            materials={materials}
            expertise={expertise}
            onLessonVersionChange={onLessonVersionChange}
            goTo={(step) => void workflow.goTo(step)}
          />
        </section>
        <LessonContextSidebar workspace={workspace} course={course} activeStep={workflow.activeStep} />
      </div>
    </>
  );
}
