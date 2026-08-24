import type {
  ContentSelectionDecision,
  LessonContentContext,
  LessonCurriculumRequirement,
  LessonUmkEvidenceItem
} from '../../../entities/content/model.js';
import './content-context.css';

export interface ContentContextPanelProps {
  context: LessonContentContext | null;
  loading: boolean;
  busyMappingId: string | null;
  onSetUmkDecision(
    item: LessonUmkEvidenceItem,
    decision: ContentSelectionDecision
  ): Promise<void>;
  onNext(): void;
}

const requirementKindLabels: Record<LessonCurriculumRequirement['kind'], string> = {
  CONTENT: 'Содержание',
  OUTCOME: 'Результат',
  ASSESSMENT: 'Оценивание',
  HOURS: 'Объём'
};

const stageLabels: Record<LessonCurriculumRequirement['allocationStage'], string> = {
  MANDATORY: 'Обязательно',
  INTRODUCE: 'Ввести',
  DEVELOP: 'Развивать',
  APPLY: 'Применять',
  ASSESS: 'Проверить'
};

const scopeLabels: Record<LessonCurriculumRequirement['allocationScope'], string> = {
  COURSE: 'курс',
  SECTION: 'раздел',
  LESSON: 'урок'
};

const relationLabels: Record<LessonUmkEvidenceItem['relationType'], string> = {
  PRIMARY: 'основной материал',
  SUPPORTING: 'поддерживающий материал',
  ASSESSMENT: 'задание / оценивание',
  EXTENSION: 'расширение'
};

const resourceLabels: Record<LessonUmkEvidenceItem['resourceType'], string> = {
  TEXTBOOK: 'Учебник',
  METHOD_GUIDE: 'Методическое пособие',
  ATLAS: 'Атлас',
  WORKBOOK: 'Рабочая тетрадь',
  ASSESSMENT: 'Оценочные материалы',
  DIGITAL: 'Цифровой ресурс',
  OTHER: 'Материал УМК'
};

const selectionLabels: Record<LessonUmkEvidenceItem['selection']['state'], string> = {
  UNDECIDED: 'Решение не принято',
  INCLUDED: '✓ Включено педагогом',
  EXCLUDED: 'Не используется'
};

function SourceProvenance({ item }: { item: LessonUmkEvidenceItem }) {
  return (
    <div className="content-provenance">
      <span>{item.source.title}</span>
      <span>v{item.source.sourceVersion}</span>
      <span>{item.source.rightsBasis}</span>
      <span>{item.source.accessLevel}</span>
      {item.pages ? <span>{item.pages}</span> : null}
    </div>
  );
}

export function ContentContextPanel({
  context,
  loading,
  busyMappingId,
  onSetUmkDecision,
  onNext
}: ContentContextPanelProps) {
  if (loading && !context) {
    return <div className="content-context-loading">Загружаем нормативный и УМК-контекст…</div>;
  }

  if (!context) {
    return (
      <section className="content-context">
        <div className="content-empty-state">
          <strong>Контекст содержания пока недоступен</strong>
          <p>Для урока не найден закреплённый пакет рабочей программы или УМК.</p>
        </div>
      </section>
    );
  }

  const includedCount = context.approvedContentSet.includedUmkMappingIds.length;
  const excludedCount = context.approvedContentSet.excludedUmkMappingIds.length;
  const undecidedCount = context.approvedContentSet.undecidedUmkMappingIds.length;

  return (
    <section className="content-context" aria-labelledby="content-context-title">
      <div className="section-intro content-context-intro">
        <span className="eyebrow">Шаг 4 · управляемое содержание</span>
        <h2 id="content-context-title">Соберите утверждённый набор содержания урока</h2>
        <p>
          Требования рабочей программы входят в обязательное ядро автоматически. Материалы УМК
          становятся частью дальнейшего сценария только после явного решения педагога «Использовать».
          Исключение материала не удаляет его из УМК — оно фиксирует решение только для этого урока.
        </p>
      </div>

      <div className="content-pack-summary content-pack-summary--selection">
        <div>
          <span>Рабочая программа</span>
          <strong>{context.curriculumPack.title}</strong>
          <small>{context.curriculumPack.id} · v{context.curriculumPack.version}</small>
        </div>
        <div>
          <span>УМК</span>
          <strong>{context.contentPack.title}</strong>
          <small>{context.contentPack.id} · v{context.contentPack.version}</small>
        </div>
        <div>
          <span>Обязательное ядро</span>
          <strong>{context.approvedContentSet.mandatoryRequirementIds.length} требований РП</strong>
          <small>Защищено от исключения.</small>
        </div>
        <div>
          <span>Решения по УМК</span>
          <strong>{includedCount} включено · {excludedCount} исключено</strong>
          <small>{undecidedCount ? `Ещё ${undecidedCount} без решения.` : 'Все материалы рассмотрены.'}</small>
        </div>
      </div>

      <section className="content-source-section content-source-section--rp">
        <div className="content-source-section__heading">
          <div>
            <span className="content-source-label">ОБЯЗАТЕЛЬНО ПО РП</span>
            <h3>Нормативное ядро урока</h3>
            <p>Эти требования всегда входят в approved content set и не имеют действия «Исключить».</p>
          </div>
          <span className="count-badge">{context.curriculumRequirements.length}</span>
        </div>

        {context.curriculumRequirements.length ? (
          <div className="content-card-list">
            {context.curriculumRequirements.map((requirement) => (
              <article className="content-evidence-card content-evidence-card--locked" key={requirement.id}>
                <div className="content-selection-topline">
                  <span className="content-selection-state content-selection-state--locked">
                    🔒 Входит обязательно
                  </span>
                  <span className="content-selection-explainer">Решение задаётся рабочей программой</span>
                </div>
                <div className="content-badge-row">
                  <span className="content-badge">{requirementKindLabels[requirement.kind]}</span>
                  <span className="content-badge">{stageLabels[requirement.allocationStage]}</span>
                  <span className="content-badge">уровень: {scopeLabels[requirement.allocationScope]}</span>
                  {requirement.code ? <span className="content-badge">{requirement.code}</span> : null}
                </div>
                <p className="content-evidence-text">{requirement.text}</p>
                {requirement.source ? (
                  <div className="content-provenance">
                    <span>{requirement.source.title}</span>
                    <span>v{requirement.source.sourceVersion}</span>
                    <span>{requirement.source.sourceType}</span>
                  </div>
                ) : (
                  <div className="content-provenance content-provenance--warning">
                    <span>Источник требования не привязан к пакету РП.</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="content-empty-state">
            <strong>Для этого урока нет распределённых требований</strong>
            <p>Это не означает, что требований нет в рабочей программе: требуется проверить импорт и allocations.</p>
          </div>
        )}
      </section>

      <section className="content-source-section content-source-section--umk">
        <div className="content-source-section__heading">
          <div>
            <span className="content-source-label">СОДЕРЖИТСЯ В УМК</span>
            <h3>Выберите материалы, которые реально войдут в урок</h3>
            <p>Доступны только mappings со статусом APPROVED. Каждое действие сохраняется как решение педагога с ревизией и provenance.</p>
          </div>
          <span className="count-badge">{context.umkEvidence.length}</span>
        </div>

        {context.umkEvidence.length ? (
          <div className="content-card-list">
            {context.umkEvidence.map((item) => {
              const busy = busyMappingId === item.mappingId;
              const stateClass = item.selection.state.toLowerCase();
              return (
                <article
                  className={`content-evidence-card content-evidence-card--selectable is-${stateClass}`}
                  key={item.mappingId}
                >
                  <div className="content-selection-topline">
                    <span className={`content-selection-state is-${stateClass}`}>
                      {selectionLabels[item.selection.state]}
                    </span>
                    {item.selection.revision ? (
                      <span className="content-selection-explainer">ревизия {item.selection.revision}</span>
                    ) : (
                      <span className="content-selection-explainer">Нужно решение педагога</span>
                    )}
                  </div>

                  <div className="content-evidence-card__title">
                    <div>
                      <span>{resourceLabels[item.resourceType]}</span>
                      <h4>{item.title}</h4>
                    </div>
                    <span className="content-unit-type">{item.unitType}</span>
                  </div>
                  <div className="content-badge-row">
                    <span className="content-badge">{relationLabels[item.relationType]}</span>
                    <span className="content-badge">уровень: {scopeLabels[item.mappingScope]}</span>
                    {item.sectionRef ? <span className="content-badge">{item.sectionRef}</span> : null}
                    {item.pages ? <span className="content-badge">{item.pages}</span> : null}
                  </div>

                  {item.text ? <p className="content-evidence-text">{item.text}</p> : null}
                  {item.textRestricted ? (
                    <div className="content-restricted-note">
                      <strong>Текст не раскрывается</strong>
                      <p>
                        Для этого источника разрешены только метаданные. Решение можно принять по
                        доступному описанию, но платформа не передаёт ограниченный текст в браузер и
                        не заменяет его AI-реконструкцией.
                      </p>
                    </div>
                  ) : null}
                  <SourceProvenance item={item} />

                  <div className="content-selection-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy || item.selection.state === 'INCLUDED'}
                      onClick={() => void onSetUmkDecision(item, 'INCLUDED')}
                    >
                      {busy ? 'Сохраняем…' : '✓ Использовать'}
                    </button>
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={busy || item.selection.state === 'EXCLUDED'}
                      onClick={() => void onSetUmkDecision(item, 'EXCLUDED')}
                    >
                      Не использовать
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="content-empty-state">
            <strong>Проверенных привязок УМК пока нет</strong>
            <p>Непроверенные mappings намеренно не показываются как авторитетное содержание урока.</p>
          </div>
        )}
      </section>

      <section className="content-source-section content-source-section--ai">
        <div className="content-source-section__heading">
          <div>
            <span className="content-source-label">РЕКОМЕНДУЕТ AI ДОПОЛНИТЕЛЬНО</span>
            <h3>Дополнительные материалы</h3>
            <p>AI-дополнения отделены от РП и УМК и никогда не выдаются за содержание учебника.</p>
          </div>
          <span className="count-badge">{context.aiSupplemental.length}</span>
        </div>
        <div className="content-empty-state">
          <strong>Дополнительные материалы не запрашивались</strong>
          <p>
            AI-дополнение появится отдельным управляемым действием с provenance. Оно также не сможет
            попасть в сценарий без явного решения педагога.
          </p>
        </div>
      </section>

      <div className="workflow-next-card">
        <div>
          <strong>Сценарий получит только выбранное содержание</strong>
          <p>
            Включено материалов УМК: {context.approvedContentSet.includedUmkMappingIds.length};
            без решения: {context.approvedContentSet.undecidedUmkMappingIds.length}.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={onNext}>
          Перейти к сценарию →
        </button>
      </div>
    </section>
  );
}
