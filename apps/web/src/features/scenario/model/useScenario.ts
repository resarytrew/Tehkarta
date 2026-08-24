import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScenarioPayload, ScenarioStage } from '../../../entities/artifact/model.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import type { useDesignArtifacts } from './useDesignArtifacts.js';
import { scenarioDefaults } from './scenarioDefaults.js';

type ArtifactActions = ReturnType<typeof useDesignArtifacts>;

export function useScenario(workspace: LessonWorkspace, artifactActions: ArtifactActions) {
  const lesson = workspace.lesson;
  const artifact = artifactActions.artifacts.find((item) => item.kind === 'SCENARIO') as
    | import('../../../entities/artifact/model.js').LessonDesignArtifact<ScenarioPayload>
    | undefined;
  const [stages, setStages] = useState<ScenarioStage[]>([]);

  useEffect(() => {
    if (!lesson) { setStages([]); return; }
    setStages(artifact?.payload.stages ?? scenarioDefaults(lesson, workspace.scenarioContext));
  }, [artifact?.revision, lesson, workspace.scenarioContext]);

  const totalMinutes = useMemo(() => stages.reduce((sum, stage) => sum + stage.minutes, 0), [stages]);
  const regenerate = useCallback(() => {
    if (lesson) setStages(scenarioDefaults(lesson, workspace.scenarioContext));
  }, [lesson, workspace.scenarioContext]);
  const save = useCallback(async () => {
    if (!lesson) return;
    await artifactActions.save('SCENARIO', {
      stages,
      generatedFromLessonVersion: lesson.version,
      generatedFromCoursePlanRevision: workspace.scenarioContext?.coursePlanning?.planRevision ?? 0,
      generatedFromCourseContextRevision: workspace.scenarioContext?.coursePlanning?.contextRevision ?? ''
    });
  }, [artifactActions, lesson, stages, workspace.scenarioContext]);

  return { artifact, stages, setStages, totalMinutes, regenerate, save };
}
