import type { useLessonExpertise } from '../model/useLessonExpertise.js';

export function LessonExpertise({ expertise, onNext }: { expertise: ReturnType<typeof useLessonExpertise>; onNext(): void }) {
  return (
    <div className="workflow-panel">
      <div className="section-intro"><span className="eyebrow">Шаг 7 · экспертиза</span><h2>Проверка целостности урока</h2><p>Автоматические проверки связности решений, времени и готовности материалов.</p></div>
      <div className="expert-score"><strong>{expertise.passed}/{expertise.total}</strong><span>{expertise.isReady ? 'Урок готов к выпуску' : 'Есть замечания'}</span></div>
      <div className="expert-check-list">{expertise.checks.map((check) => <div className={check.ok ? 'expert-check is-passed' : 'expert-check is-failed'} key={check.label}><span>{check.ok ? '✓' : '!'}</span><p>{check.label}</p></div>)}</div>
      <div className="workflow-actions"><button className="button button-primary" type="button" onClick={onNext}>{expertise.isReady ? 'Перейти к карте урока →' : 'Открыть карту с замечаниями →'}</button></div>
    </div>
  );
}
