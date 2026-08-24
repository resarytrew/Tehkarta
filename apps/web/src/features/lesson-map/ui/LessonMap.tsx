import type { ApprovedScenarioContext, LessonMaterialItem, ScenarioStage } from '../../../entities/artifact/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { ExpertiseCheck } from '../../expertise/model/useLessonExpertise.js';

export function LessonMap({ lesson, context, stages, materials, checks, onFinish }: {
  lesson: Lesson;
  context: ApprovedScenarioContext | null;
  stages: ScenarioStage[];
  materials: LessonMaterialItem[];
  checks: ExpertiseCheck[];
  onFinish(): void;
}) {
  const totalMinutes = stages.reduce((sum, stage) => sum + stage.minutes, 0);
  function downloadMap() {
    const data = { lesson, scenario: stages, materials, expertise: checks };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lesson.id}-lesson-map.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="workflow-panel lesson-map">
      <div className="section-intro"><span className="eyebrow">Шаг 8 · карта урока</span><h2>{lesson.title}</h2><p>{context?.concept.bigIdea ?? 'Итоговая карта объединяет утверждённые решения урока.'}</p></div>
      <section><h3>Цель</h3><p>{context?.concept.goal ?? 'Не утверждена'}</p></section>
      <section><h3>Проблемный вопрос</h3><p>{context?.concept.problemQuestion ?? 'Не утверждён'}</p></section>
      <section><h3>Результаты и методика</h3><ul>{(context?.outcomes ?? []).map((item) => <li key={item}>{item}</li>)}</ul><p>{context?.methodology.methods.join(', ') || 'Метод не выбран'}</p></section>
      <section><h3>Сценарий · {totalMinutes} минут</h3>{stages.map((stage) => <div className="map-stage" key={stage.id}><strong>{stage.title} · {stage.minutes} мин</strong><span>{stage.studentAction}</span></div>)}</section>
      <section><h3>Материалы</h3><ul>{materials.map((item) => <li key={item.id}>{item.ready ? '✓' : '○'} {item.title}</li>)}</ul></section>
      <div className="workflow-actions no-print"><button className="button button-secondary" type="button" onClick={() => window.print()}>Печать</button><button className="button button-primary" type="button" onClick={downloadMap}>Скачать JSON</button><button className="button button-secondary" type="button" onClick={onFinish}>Завершить и вернуться к замыслу ↺</button></div>
    </div>
  );
}
