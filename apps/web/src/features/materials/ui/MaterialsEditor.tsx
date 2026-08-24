import type { LessonDesignArtifactKind } from '../../../entities/artifact/model.js';
import type { useMaterials } from '../model/useMaterials.js';

export function MaterialsEditor({ model, busyKind, onNext }: {
  model: ReturnType<typeof useMaterials>;
  busyKind: LessonDesignArtifactKind | null;
  onNext(): void;
}) {
  const canSave = model.items.length > 0 && busyKind !== 'MATERIALS';
  async function saveAndContinue() {
    try { await model.save(); onNext(); } catch { /* Notification service owns the error. */ }
  }
  return (
    <div className="workflow-panel">
      <div className="section-intro"><span className="eyebrow">Шаг 6 · материалы</span><h2>Комплект материалов урока</h2><p>Отметьте готовность источников, рабочих листов и опор для этапов сценария.</p></div>
      <div className="material-list">
        {model.items.map((item, index) => (
          <article className="material-editor" key={item.id}>
            <input aria-label={`Название материала ${index + 1}`} value={item.title} onChange={(event) => model.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} />
            <textarea aria-label={`Назначение материала ${index + 1}`} value={item.purpose} onChange={(event) => model.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, purpose: event.target.value } : entry))} />
            <div><span>{item.source ?? 'Источник не указан'}</span><label><input type="checkbox" checked={item.ready} onChange={(event) => model.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ready: event.target.checked } : entry))} /> Готов к уроку</label></div>
          </article>
        ))}
      </div>
      <div className="workflow-actions">
        <button className="button button-ghost" type="button" onClick={model.regenerate}>↻ Сформировать из сценария и контекста курса</button>
        <button className="button button-ghost" type="button" onClick={model.add}>＋ Добавить материал</button>
        <button className="button button-secondary" type="button" disabled={!canSave} onClick={() => void model.save()}>{busyKind === 'MATERIALS' ? 'Сохраняем…' : 'Сохранить комплект'}</button>
        <button className="button button-primary" type="button" disabled={!canSave} onClick={() => void saveAndContinue()}>Сохранить и перейти к экспертизе →</button>
      </div>
    </div>
  );
}
