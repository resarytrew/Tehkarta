import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApprovedScenarioContext, LessonDesignArtifact, ScenarioPayload, ScenarioStage } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { useDesignArtifacts } from './useDesignArtifacts.js';
import { scenarioDefaults } from './scenarioDefaults.js';

type ArtifactActions = ReturnType<typeof useDesignArtifacts>;

export interface ScenarioDependencies {
  lesson: Lesson | null;
  context: ApprovedScenarioContext | null;
  artifacts: LessonDesignArtifact[];
  saveArtifact: ArtifactActions['save'];
}

export function useScenario(dependencies: ScenarioDependencies) {
  const { lesson, context, artifacts, saveArtifact } = dependencies;
  const contextRevision = context?.coursePlanning?.contextRevision;
  const contextLessonVersion = context?.lesson.version;
  const artifact = artifacts.find((item) => item.kind === 'SCENARIO') as
    | import('../../../entities/artifact/model.js').LessonDesignArtifact<ScenarioPayload>
    | undefined;
  const [stages, setStages] = useState<ScenarioStage[]>([]);

  useEffect(() => {
    if (!lesson) { setStages([]); return; }
    setStages(artifact?.payload.stages
      ? artifact.payload.stages.map((stage) => ({ ...stage, technologyPhaseIds: Array.isArray(stage.technologyPhaseIds) ? stage.technologyPhaseIds : [] }))
      : scenarioDefaults(lesson, context));
  }, [artifact?.revision, contextLessonVersion, contextRevision, lesson?.id, lesson?.version]);

  const totalMinutes = useMemo(() => stages.reduce((sum, stage) => sum + stage.minutes, 0), [stages]);
  const regenerate = useCallback(() => {
    if (lesson) setStages(scenarioDefaults(lesson, context));
  }, [context, lesson]);
  const save = useCallback(async () => {
    if (!lesson) return;
    await saveArtifact('SCENARIO', {
      stages,
      generatedFromLessonVersion: lesson.version,
      generatedFromCoursePlanRevision: context?.coursePlanning?.planRevision ?? 0,
      generatedFromCourseContextRevision: context?.coursePlanning?.contextRevision ?? '',
      technologyId: context?.methodology.technology?.technologyId,
      methodologyPackId: context?.methodology.technology?.methodologyPackId,
      methodologyPackVersion: context?.methodology.technology?.methodologyPackVersion,
      technologyRevision: context?.methodology.technologyRevision,
      pedagogicalProfileRevision: context?.methodology.pedagogicalProfileRevision
    });
  }, [context, lesson, saveArtifact, stages]);

  return { artifact, stages, setStages, totalMinutes, regenerate, save };
}
