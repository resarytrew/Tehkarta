import { useCallback, useEffect, useState } from 'react';
import type { ApprovedScenarioContext, LessonDesignArtifact, LessonMaterialItem, MaterialsPayload, ScenarioStage } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { useDesignArtifacts } from '../../scenario/model/useDesignArtifacts.js';
import { materialDefaults } from './materialDefaults.js';

type ArtifactActions = ReturnType<typeof useDesignArtifacts>;

export interface MaterialsDependencies {
  lesson: Lesson | null;
  context: ApprovedScenarioContext | null;
  artifacts: LessonDesignArtifact[];
  scenario: { artifact: LessonDesignArtifact | undefined; stages: ScenarioStage[] };
  saveArtifact: ArtifactActions['save'];
}

export function useMaterials(dependencies: MaterialsDependencies) {
  const { lesson, context, artifacts, scenario, saveArtifact } = dependencies;
  const contextRevision = context?.coursePlanning?.contextRevision;
  const contextLessonVersion = context?.lesson.version;
  const artifact = artifacts.find((item) => item.kind === 'MATERIALS') as LessonDesignArtifact<MaterialsPayload> | undefined;
  const [items, setItems] = useState<LessonMaterialItem[]>([]);

  useEffect(() => {
    if (!lesson) { setItems([]); return; }
    setItems(artifact?.payload.items ?? materialDefaults(context, scenario.stages));
  }, [artifact?.revision, contextLessonVersion, contextRevision, lesson?.id, lesson?.version, scenario.artifact?.revision]);

  const regenerate = useCallback(() => {
    setItems(materialDefaults(context, scenario.stages));
  }, [context, scenario.stages]);
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
    await saveArtifact('MATERIALS', {
      items,
      generatedFromLessonVersion: lesson.version,
      generatedFromScenarioRevision: scenario.artifact?.revision ?? 0,
      generatedFromCoursePlanRevision: context?.coursePlanning?.planRevision ?? 0,
      generatedFromCourseContextRevision: context?.coursePlanning?.contextRevision ?? ''
    });
  }, [context, items, lesson, saveArtifact, scenario.artifact?.revision]);

  return { artifact, items, setItems, regenerate, add, save };
}
