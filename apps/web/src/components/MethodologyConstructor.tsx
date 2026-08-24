import { useEffect, useMemo, useState } from 'react';
import type {
  Lesson,
  MethodologyRecommendation,
  MethodologyRecommendationBundle
} from '../types.js';

interface RecommendationChoice {
  formId: string;
  techniqueIds: string[];
}

export interface MethodologyConstructorProps {
  lesson: Lesson;
  bundle: MethodologyRecommendationBundle | null;
  loading: boolean;
  busyRecommendationId: string | null;
  addingOutcome: boolean;
  onAddOutcome(value: string): Promise<void>;
  onUseRecommendation(
    recommendation: MethodologyRecommendation,
    choice: RecommendationChoice
  ): Promise<void>;
  onRejectRecommendation(recommendation: MethodologyRecommendation): Promise<void>;
  onNext(): void;
}

const outcomeKindLabels: Record<string, string> = {
  KNOWLEDGE: 'предметное знание',
  CAUSAL_EXPLANATION: 'причинно-следственное объяснение',
  SOURCE_ANALYSIS: 'анализ источника',
  COMPARISON: 'сравнение',
  DATA_INTERPRETATION: 'работа с данными',
  CARTOGRAPHY: 'картографический анализ',
  MODELING: 'моделирование',
  ARGUMENTATION: 'аргументация'
};

function initialChoice(recommendation: MethodologyRecommendation): RecommendationChoice {
  return {
    formId: recommendation.compatibleForms[0]?.id ?? '',
    techniqueIds: recommendation.suggestedTechniques.map((technique) => technique.id)
  };
}

function approvedValues(fields: Lesson['outcomes']): string[] {
  return fields
    .filter((field) => field.meta.status === 'APPROVED')
    .map((field) => field.value);
}

export function MethodologyConstructor({
  lesson,
  bundle,
  loading,
  busyRecommendationId,
  addingOutcome,
  onAddOutcome,
  onUseRecommendation,
  onRejectRecommendation,
  onNext
}: MethodologyConstructorProps) {
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, RecommendationChoice>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!bundle) return;
    setChoices((current) => {
      const next = { ...current };
      for (const recommendation of bundle.recommendations) {
        if (!next[recommendation.id]) next[recommendation.id] = initialChoice(recommendation);
      }
      return next;
    });
  }, [bundle]);

  const approvedOutcomes = useMemo(() => approvedValues(lesson.outcomes), [lesson.outcomes]);
  const recommendations = bundle?.recommendations ?? [];

  async function submitOutcome(): Promise<void> {
    const value = outcomeDraft.trim();
    if (value.length < 3) {
      setLocalError('Сформулируйте результат минимум из трёх символов.');
      return;
    }
    setLocalError(null);
    try {
      await onAddOutcome(value);
      setOutcomeDraft('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Не удалось добавить результат.');
    }
  }

  function toggleExpanded(id: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setForm(recommendation: MethodologyRecommendation, formId: string): void {
    setChoices((current) => ({
      ...current,
      [recommendation.id]: {
        ...(current[recommendation.id] ?? initialChoice(recommendation)),
        formId
      }
    }));
  }

  function toggleTechnique(recommendation: MethodologyRecommendation, techniqueId: string): void {
    setChoices((current) => {
      const choice = current[recommendation.id] ?? initialChoice(recommendation);
      const techniqueIds = choice.techniqueIds.includes(techniqueId)
        ? choice.techniqueIds.filter((id) => id !== techniqueId)
        : [...choice.techniqueIds, techniqueId];
      return { ...current, [recommendation.id]: { ...choice, techniqueIds } };
    });
  }

  return (
    <section className="methodology-constructor" aria-labelledby="methodology-title">
      <div className="section-intro methodology-intro">
        <span className="eyebrow">Шаг 3 · методический конструктор</span>
        <h2 id="methodology-title">Методы под утверждённый результат</h2>
        <p>
          Платформа сопоставляет только утверждённые педагогом результаты урока с фазами
          педагогической технологии. Метод, приёмы и форма организации остаются разными сущностями:
          рекомендация ничего не меняет, пока педагог явно не нажмёт «Использовать».
        </p>
      </div>

      <div className="methodology-principle">
        <div>
          <span className="methodology-principle__number">1</span>
          <strong>Результат</strong>
          <p>Что ученик должен уметь объяснить, доказать, сравнить или интерпретировать.</p>
        </div>
        <div>
          <span className="methodology-principle__number">2</span>
          <strong>Метод</strong>
          <p>Какой способ познавательной деятельности действительно ведёт к результату.</p>
        </div>
        <div>
          <span className="methodology-principle__number">3</span>
          <strong>Приёмы и форма</strong>
          <p>Конкретные действия и организация работы выбираются отдельно и осознанно.</p>
        </div>
      </div>

      <section className="outcome-panel">
        <div className="outcome-panel__header">
          <div>
            <span className="eyebrow">Авторитетный контекст</span>
            <h3>Утверждённые результаты урока</h3>
          </div>
          <span className="count-badge">{approvedOutcomes.length}</span>
        </div>

        {approvedOutcomes.length > 0 ? (
          <div className="approved-outcome-list">
            {approvedOutcomes.map((outcome, index) => (
              <div className="approved-outcome" key={`${outcome}-${index}`}>
                <span>✓</span>
                <p>{outcome}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="methodology-empty-state">
            <strong>Пока нет утверждённых результатов</strong>
            <p>
              Рекомендации не строятся по черновикам. Сначала зафиксируйте хотя бы один измеримый
              результат урока.
            </p>
          </div>
        )}

        <div className="outcome-add-row">
          <textarea
            value={outcomeDraft}
            onChange={(event) => setOutcomeDraft(event.target.value)}
            placeholder="Например: объяснять причины успехов промышленной революции XIX века, опираясь на факты и причинно-следственные связи"
            rows={3}
            disabled={addingOutcome}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={addingOutcome || outcomeDraft.trim().length < 3}
            onClick={() => void submitOutcome()}
          >
            {addingOutcome ? 'Сохраняем…' : '＋ Добавить и утвердить результат'}
          </button>
        </div>
        {localError ? <div className="inline-error">{localError}</div> : null}
      </section>

      {bundle ? (
        <div className="methodology-pack-banner">
          <div>
            <span className="eyebrow">Methodology Pack · v{bundle.pack.version}</span>
            <h3>{bundle.pack.technology.name}</h3>
            <p>{bundle.pack.technology.description}</p>
          </div>
          <div className="methodology-pack-id">{bundle.pack.id}</div>
        </div>
      ) : null}

      {loading ? <div className="methodology-loading">Обновляем рекомендации…</div> : null}

      {!loading && approvedOutcomes.length > 0 && recommendations.length === 0 ? (
        <div className="methodology-empty-state">
          <strong>Подходящих активных рекомендаций нет</strong>
          <p>
            Возможно, варианты уже были отклонены. Измените или добавьте утверждённый результат —
            рекомендации пересчитаются детерминированно по актуальному состоянию урока.
          </p>
        </div>
      ) : null}

      <div className="methodology-recommendations">
        {recommendations.map((recommendation, index) => {
          const choice = choices[recommendation.id] ?? initialChoice(recommendation);
          const expanded = expandedIds.has(recommendation.id);
          const busy = busyRecommendationId === recommendation.id;
          const selectedForm = recommendation.compatibleForms.find(
            (form) => form.id === choice.formId
          );

          return (
            <article className="methodology-card" key={recommendation.id}>
              <div className="methodology-card__topline">
                <span className="recommendation-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="methodology-card__phase">
                  <span>{recommendation.technology.name}</span>
                  <strong>Фаза: {recommendation.technologyPhase.name}</strong>
                </div>
                <div className="time-badge">
                  {recommendation.estimatedMinutes.min}–{recommendation.estimatedMinutes.max} мин
                </div>
              </div>

              <div className="methodology-card__outcome">
                <span>Основание рекомендации</span>
                <p>{recommendation.targetOutcome.value}</p>
                <div className="methodology-tag-row">
                  {recommendation.targetOutcome.inferredKinds.map((kind) => (
                    <span className="methodology-tag" key={kind}>
                      {outcomeKindLabels[kind] ?? kind}
                    </span>
                  ))}
                </div>
              </div>

              <div className="methodology-card__method">
                <span className="eyebrow">Рекомендуемый метод</span>
                <h3>{recommendation.method.name}</h3>
                <p>{recommendation.method.description}</p>
                <div className="recommendation-rationale">{recommendation.rationale}</div>
              </div>

              <div className="methodology-choice-grid">
                <div className="methodology-choice-block">
                  <span className="methodology-choice-label">Приёмы</span>
                  <p className="methodology-choice-hint">
                    Отметьте конкретные действия, которые хотите использовать.
                  </p>
                  <div className="technique-checklist">
                    {recommendation.suggestedTechniques.map((technique) => (
                      <label key={technique.id} className="technique-option">
                        <input
                          type="checkbox"
                          checked={choice.techniqueIds.includes(technique.id)}
                          onChange={() => toggleTechnique(recommendation, technique.id)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{technique.name}</strong>
                          <small>
                            {technique.typicalMinutes.min}–{technique.typicalMinutes.max} мин ·{' '}
                            {technique.description}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="methodology-choice-block">
                  <span className="methodology-choice-label">Форма организации</span>
                  <p className="methodology-choice-hint">
                    Форма не является методом — выберите её отдельно.
                  </p>
                  <div className="form-options">
                    {recommendation.compatibleForms.map((form) => (
                      <label
                        key={form.id}
                        className={`form-option ${choice.formId === form.id ? 'is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`form-${recommendation.id}`}
                          value={form.id}
                          checked={choice.formId === form.id}
                          onChange={() => setForm(recommendation, form.id)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{form.name}</strong>
                          <small>{form.participantPattern}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedForm?.constraints.length ? (
                    <div className="methodology-constraint-note">
                      {selectedForm.constraints.join(' ')}
                    </div>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="methodology-details">
                  <div>
                    <strong>Что подготовить</strong>
                    {recommendation.method.preparation.length ? (
                      <ul>
                        {recommendation.method.preparation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>Специальной подготовки не требуется.</p>
                    )}
                  </div>
                  <div>
                    <strong>Ограничения и проверка реалистичности</strong>
                    <ul>
                      {recommendation.constraintNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Чего избегать</strong>
                    <ul>
                      {recommendation.method.antiPatterns.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Последовательность выбранных приёмов</strong>
                    {recommendation.suggestedTechniques
                      .filter((technique) => choice.techniqueIds.includes(technique.id))
                      .map((technique) => (
                        <div className="technique-instructions" key={technique.id}>
                          <span>{technique.name}</span>
                          <ol>
                            {technique.instructions.map((instruction) => (
                              <li key={instruction}>{instruction}</li>
                            ))}
                          </ol>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="methodology-card__actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy || !choice.formId}
                  onClick={() => void onUseRecommendation(recommendation, choice)}
                >
                  {busy ? 'Применяем…' : '✓ Использовать'}
                </button>
                <button
                  className="button button-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void onRejectRecommendation(recommendation)}
                >
                  Не использовать
                </button>
                <button
                  className="button button-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => toggleExpanded(recommendation.id)}
                >
                  {expanded ? 'Скрыть детали' : 'Подробнее'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {lesson.selectedMethods.length > 0 ? (
        <section className="selected-methodology-summary">
          <div>
            <span className="eyebrow">Уже утверждено педагогом</span>
            <h3>Методическая конфигурация урока</h3>
          </div>
          <div className="selected-methodology-grid">
            <div>
              <span>Методы</span>
              <strong>
                {lesson.selectedMethods
                  .filter((field) => field.meta.status === 'APPROVED')
                  .map((field) => field.value)
                  .join(', ') || '—'}
              </strong>
            </div>
            <div>
              <span>Приёмы</span>
              <strong>
                {lesson.selectedTechniques
                  .filter((field) => field.meta.status === 'APPROVED')
                  .map((field) => field.value)
                  .join(', ') || '—'}
              </strong>
            </div>
            <div>
              <span>Формы</span>
              <strong>
                {lesson.selectedForms
                  .filter((field) => field.meta.status === 'APPROVED')
                  .map((field) => field.value)
                  .join(', ') || '—'}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      <div className="workflow-next-card">
        <div>
          <strong>Следующий шаг использует утверждённые результаты и методику</strong>
          <p>
            Передаётся результатов: {approvedOutcomes.length}; методов:{' '}
            {lesson.selectedMethods.filter((field) => field.meta.status === 'APPROVED').length}.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={onNext}>
          Перейти к содержанию УМК →
        </button>
      </div>

      {bundle?.courseContext ? (
        <section className="methodology-course-context">
          <div>
            <span className="eyebrow">Контекст всего курса · редакция {bundle.courseContext.planRevision}</span>
            <h3>{bundle.courseContext.currentTopic ?? 'Текущий урок'}</h3>
            <p>
              Учтено предыдущих изученных уроков: {bundle.courseContext.previousLessonCount};
              разрешённых документов: {bundle.courseContext.approvedSourceCount}.
            </p>
          </div>
          <div>
            <span>Уже освоено</span>
            <strong>{bundle.courseContext.masteredConcepts.join(', ') || 'Пока не отмечено'}</strong>
          </div>
          <div>
            <span>Следующие темы</span>
            <strong>{bundle.courseContext.nextTopics.join(' → ') || 'Курс завершается'}</strong>
          </div>
        </section>
      ) : null}
    </section>
  );
}
