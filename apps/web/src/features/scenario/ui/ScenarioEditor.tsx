import type { ApprovedScenarioContext, LessonDesignArtifactKind } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { useScenario } from '../model/useScenario.js';
import { missingScenarioLabels } from '../model/scenarioDefaults.js';

export function ScenarioEditor({ lesson, context, model, busyKind, onNext }: {
  lesson: Lesson;
  context: ApprovedScenarioContext | null;
  model: ReturnType<typeof useScenario>;
  busyKind: LessonDesignArtifactKind | null;
  onNext(): void;
}) {
  const canSave = model.totalMinutes === lesson.durationMinutes && busyKind !== 'SCENARIO';
  async function saveAndContinue() {
    try { await model.save(); onNext(); } catch { /* Notification service owns the error. */ }
  }
  return (
    <div className="workflow-panel">
      <div className="section-intro"><span className="eyebrow">Шаг 5 · сценарий</span><h2>Этапы урока</h2><p>Время и действия участников сохраняются в версии сценария.</p></div>
      {!context?.readiness.canGenerateScenario ? (
        <div className="workflow-warning"><strong>Сценарий пока не готов к утверждению</strong><p>Не хватает: {(context?.readiness.missing ?? []).map((item) => missingScenarioLabels[item] ?? item).join(', ')}.</p></div>
      ) : null}
      <div className="scenario-timing"><strong>{model.totalMinutes} / {lesson.durationMinutes} минут</strong><span className={model.totalMinutes === lesson.durationMinutes ? 'is-ok' : 'is-error'}>{model.totalMinutes === lesson.durationMinutes ? 'Баланс соблюдён' : 'Скорректируйте время'}</span></div>
      <div className="scenario-stage-list">
        {model.stages.map((stage, index) => (
          <article className="scenario-stage" key={stage.id}>
            <div className="scenario-stage__top">
              <span>{index + 1}</span>
              <input aria-label={`Название этапа ${index + 1}`} value={stage.title} onChange={(event) => model.setStages((current) => current.map((item) => item.id === stage.id ? { ...item, title: event.target.value } : item))} />
              <input className="minutes-input" type="number" min="1" max="120" aria-label={`Минуты этапа ${index + 1}`} value={stage.minutes} onChange={(event) => model.setStages((current) => current.map((item) => item.id === stage.id ? { ...item, minutes: Number(event.target.value) } : item))} />
            </div>
            <div className="scenario-stage__actions">
              <textarea aria-label={`Действия учителя ${index + 1}`} value={stage.teacherAction} onChange={(event) => model.setStages((current) => current.map((item) => item.id === stage.id ? { ...item, teacherAction: event.target.value } : item))} />
              <textarea aria-label={`Действия учеников ${index + 1}`} value={stage.studentAction} onChange={(event) => model.setStages((current) => current.map((item) => item.id === stage.id ? { ...item, studentAction: event.target.value } : item))} />
            </div>
          </article>
        ))}
      </div>
      <div className="workflow-actions">
        <button className="button button-ghost" type="button" onClick={model.regenerate}>↻ Сформировать из контекста курса</button>
        <button className="button button-secondary" type="button" disabled={!canSave} onClick={() => void model.save()}>{busyKind === 'SCENARIO' ? 'Сохраняем…' : `Сохранить сценарий${model.artifact ? ` · версия ${model.artifact.revision + 1}` : ''}`}</button>
        <button className="button button-primary" type="button" disabled={!canSave} onClick={() => void saveAndContinue()}>Сохранить и перейти к материалам →</button>
      </div>
    </div>
  );
}
