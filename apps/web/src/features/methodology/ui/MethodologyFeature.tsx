import type { LessonWorkspace } from '../../lesson-designer/model/useLessonWorkspace.js';
import { useMethodology } from '../model/useMethodology.js';
import { MethodologyConstructor } from './MethodologyConstructor.js';
import { usePedagogicalProfile } from '../../pedagogical-profile/model/usePedagogicalProfile.js';
import { PedagogicalProfilePanel } from '../../pedagogical-profile/ui/PedagogicalProfilePanel.js';
import { useTechnologySelection } from '../../technology-selection/model/useTechnologySelection.js';
import { TechnologySelector } from '../../technology-selection/ui/TechnologySelector.js';
import type { Lesson } from '../../../entities/lesson/model.js';

export function MethodologyFeature({ workspace, onLessonVersionChange, onNext }: {
  workspace: LessonWorkspace;
  onLessonVersionChange(lessonId: string, version: number): void;
  onNext(): void;
}) {
  if (!workspace.lesson) return null;
  return <ReadyMethodologyFeature workspace={workspace} lesson={workspace.lesson} onLessonVersionChange={onLessonVersionChange} onNext={onNext} />;
}

function ReadyMethodologyFeature({ workspace, lesson, onLessonVersionChange, onNext }: {
  workspace: LessonWorkspace;
  lesson: Lesson;
  onLessonVersionChange(lessonId: string, version: number): void;
  onNext(): void;
}) {
  const shared = {
    lesson,
    applyGovernance: workspace.applyGovernance,
    refreshLesson: workspace.refreshLesson,
    refreshMethodology: workspace.refreshMethodology,
    refreshScenario: workspace.refreshScenario
  };
  const profile = usePedagogicalProfile(shared, onLessonVersionChange);
  const technology = useTechnologySelection(shared, onLessonVersionChange);
  const model = useMethodology({
    lesson,
    bundle: workspace.methodology,
    applyGovernance: workspace.applyGovernance,
    refreshLesson: workspace.refreshLesson,
    refreshMethodology: workspace.refreshMethodology,
    refreshScenario: workspace.refreshScenario
  }, onLessonVersionChange);
  const profileApproved = [lesson.pedagogicalProfile.style, lesson.pedagogicalProfile.communicationTone, lesson.pedagogicalProfile.focus].every((field) => field?.meta.status === 'APPROVED');
  const technologyApproved = lesson.pedagogicalTechnology?.meta.status === 'APPROVED';
  return (
    <div className="methodology-constructor">
      <div className="section-intro methodology-intro"><span className="eyebrow">Шаг 3 · педагогическая модель урока</span><h2>От профиля к методам и приёмам</h2><p>Каждое ключевое решение утверждается педагогом. Следующий уровень открывается только из authoritative state.</p></div>
      <PedagogicalProfilePanel lesson={lesson} model={profile} />
      {profileApproved ? <TechnologySelector lesson={lesson} model={technology} /> : <div className="methodology-empty-state"><strong>Сначала утвердите педагогический профиль</strong><p>Стиль, тон и фокус нужны для объяснимого выбора технологии и ранжирования совместимых методов.</p></div>}
      {profileApproved && technologyApproved ? <MethodologyConstructor lesson={lesson} bundle={model.bundle} loading={workspace.loading} busyRecommendationId={model.busyRecommendationId} addingOutcome={model.addingOutcome} onAddOutcome={model.addOutcome} onUseRecommendation={model.useRecommendation} onRejectRecommendation={model.rejectRecommendation} onNext={onNext} /> : null}
    </div>
  );
}
