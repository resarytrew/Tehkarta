import type { LessonInvalidation } from '../types.js';

const semanticLabels: Record<string, string> = {
  goal: 'Цель урока',
  problemQuestion: 'Проблемный вопрос',
  bigIdea: 'Большая идея',
  outcome: 'Планируемые результаты',
  method: 'Методы',
  technique: 'Приёмы',
  form: 'Формы организации',
  content: 'Содержание',
  stage: 'Этапы урока',
  material: 'Дидактические материалы',
  assessment: 'Оценивание',
  homework: 'Домашнее задание',
  finalConclusion: 'Итоговый вывод'
};

interface InvalidationPanelProps {
  invalidations: LessonInvalidation[];
  onRecalculate(): void;
}

export function InvalidationPanel({ invalidations, onRecalculate }: InvalidationPanelProps) {
  const newestByKey = new Map<string, LessonInvalidation>();
  for (const invalidation of invalidations) {
    if (!newestByKey.has(invalidation.affectedSemanticKey)) {
      newestByKey.set(invalidation.affectedSemanticKey, invalidation);
    }
  }
  const impacted = [...newestByKey.values()];

  if (impacted.length === 0) {
    return (
      <aside className="impact-panel impact-panel--clear">
        <div className="impact-panel__icon">✓</div>
        <div>
          <strong>Связанные элементы актуальны</strong>
          <p>Утверждённые решения согласованы с текущей версией урока.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="impact-panel impact-panel--stale">
      <div className="impact-panel__heading">
        <div className="impact-panel__icon">↻</div>
        <div>
          <strong>После изменения требуется пересчёт</strong>
          <p>
            Платформа не переписывает эти блоки автоматически. Педагог сам запускает их
            обновление.
          </p>
        </div>
      </div>
      <div className="impact-tags">
        {impacted.map((item) => (
          <span className="impact-tag" key={item.affectedSemanticKey}>
            {semanticLabels[item.affectedSemanticKey] ?? item.affectedSemanticKey}
          </span>
        ))}
      </div>
      <button type="button" className="button button-secondary" onClick={onRecalculate}>
        Пересчитать связанные элементы
      </button>
    </aside>
  );
}
