import type {
  LessonContentContext,
  LessonCurriculumRequirement,
  LessonUmkEvidenceItem
} from '../types.js';

export interface ContentContextPanelProps {
  context: LessonContentContext | null;
  loading: boolean;
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

export function ContentContextPanel({ context, loading }: ContentContextPanelProps) {
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

  return (
    <section className="content-context" aria-labelledby="content-context-title">
      <div className="section-intro content-context-intro">
        <span className="eyebrow">Шаг 4 · содержание УМК</span>
        <h2 id="content-context-title">Что урок обязан покрыть и на что можно опереться</h2>
        <p>
          Платформа отделяет нормативные требования рабочей программы от конкретного содержания УМК.
          Здесь показываются только проверенные привязки к УМК; лицензионные ограничения применяются
          до передачи текста в браузер.
        </p>
      </div>

      <div className="content-pack-summary">
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
          <span>Режим содержания</span>
          <strong>{context.contentMode}</strong>
          <small>Режим не отменяет обязательное ядро РП.</small>
        </div>
      </div>

      <section className="content-source-section content-source-section--rp">
        <div className="content-source-section__heading">
          <div>
            <span className="content-source-label">ОБЯЗАТЕЛЬНО ПО РП</span>
            <h3>Нормативное ядро урока</h3>
            <p>Эти требования нельзя потерять при дальнейшем проектировании сценария и заданий.</p>
          </div>
          <span className="count-badge">{context.curriculumRequirements.length}</span>
        </div>

        {context.curriculumRequirements.length ? (
          <div className="content-card-list">
            {context.curriculumRequirements.map((requirement) => (
              <article className="content-evidence-card" key={requirement.id}>
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
            <h3>Проверенные материалы для этого урока</h3>
            <p>В список входят только привязки УМК со статусом APPROVED.</p>
          </div>
          <span className="count-badge">{context.umkEvidence.length}</span>
        </div>

        {context.umkEvidence.length ? (
          <div className="content-card-list">
            {context.umkEvidence.map((item) => (
              <article className="content-evidence-card" key={item.mappingId}>
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
                      Для этого источника разрешены только метаданные. Платформа не передаёт сохранённый
                      текст в браузер и не использует ограничение как повод подменить источник AI-реконструкцией.
                    </p>
                  </div>
                ) : null}
                <SourceProvenance item={item} />
              </article>
            ))}
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
            В первой версии этого шага здесь нет искусственно сгенерированного контента. Следующий слой
            добавит явный запрос, provenance и отдельное решение педагога о включении материала.
          </p>
        </div>
      </section>
    </section>
  );
}
