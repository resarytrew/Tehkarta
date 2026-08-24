import { useCallback } from 'react';
import type { Course } from '../../../entities/course/model.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useLessonExpertise } from '../../expertise/model/useLessonExpertise.js';
import { useLessonWorkflow } from '../../lesson-workflow/model/useLessonWorkflow.js';
import type { ActiveDesignStep } from '../../lesson-workflow/model/steps.js';
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
  const artifactActions = useDesignArtifacts(workspace);
  const scenario = useScenario(workspace, artifactActions);
  const materials = useMaterials(workspace, artifactActions, scenario);
  const expertise = useLessonExpertise(workspace, scenario, materials);
  const onEnter = useCallback(async (step: ActiveDesignStep) => {
    if (step < 4) return;
    try {
      await Promise.all([workspace.refreshLesson(), workspace.refreshScenario(), workspace.refreshContent(), workspace.refreshArtifacts()]);
    } catch (error) { await recover(error, workspace.refreshAll); }
  }, [recover, workspace]);
  const workflow = useLessonWorkflow(workspace.lesson, onEnter);

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
