import { useCallback, useEffect, useState } from 'react';
import type { LessonDesignArtifact, LessonMaterialItem, MaterialsPayload } from '../../../entities/artifact/model.js';
import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import type { useDesignArtifacts } from '../../scenario/model/useDesignArtifacts.js';
import type { useScenario } from '../../scenario/model/useScenario.js';
import { materialDefaults } from './materialDefaults.js';

type ArtifactActions = ReturnType<typeof useDesignArtifacts>;
type ScenarioModel = ReturnType<typeof useScenario>;

export function useMaterials(workspace: LessonWorkspace, artifactActions: ArtifactActions, scenario: ScenarioModel) {
  const lesson = workspace.lesson;
  const artifact = artifactActions.artifacts.find((item) => item.kind === 'MATERIALS') as LessonDesignArtifact<MaterialsPayload> | undefined;
  const [items, setItems] = useState<LessonMaterialItem[]>([]);

  useEffect(() => {
    if (!lesson) { setItems([]); return; }
    setItems(artifact?.payload.items ?? materialDefaults(workspace.scenarioContext, scenario.stages));
  }, [artifact?.revision, lesson, scenario.artifact?.revision, workspace.scenarioContext]);

  const regenerate = useCallback(() => {
    setItems(materialDefaults(workspace.scenarioContext, scenario.stages));
  }, [scenario.stages, workspace.scenarioContext]);
  const add = useCallback(() => {
    setItems((current) => [...current, {
      id: crypto.randomUUID(),
      title: 'Новый материал',
      purpose: 'Укажите назначение материала.',
      source: 'Авторский материал учителя',
      ready: false
    }]);
  }, []);
  const save = useCallback(async () => {
    if (!lesson) return;
    await artifactActions.save('MATERIALS', {
      items,
      generatedFromLessonVersion: lesson.version,
      generatedFromScenarioRevision: scenario.artifact?.revision ?? 0,
      generatedFromCoursePlanRevision: workspace.scenarioContext?.coursePlanning?.planRevision ?? 0,
      generatedFromCourseContextRevision: workspace.scenarioContext?.coursePlanning?.contextRevision ?? ''
    });
  }, [artifactActions, items, lesson, scenario.artifact?.revision, workspace.scenarioContext]);

  return { artifact, items, setItems, regenerate, add, save };
}
