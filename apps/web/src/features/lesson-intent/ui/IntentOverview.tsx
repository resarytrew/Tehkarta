import type { ApprovedScenarioContext } from '../../../entities/artifact/model.js';
import type { Course } from '../../../entities/course/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';

export function IntentOverview({ lesson, course, context, onNext }: {
  lesson: Lesson;
  course: Course | null;
  context: ApprovedScenarioContext | null;
  onNext(): void;
}) {
  const approvedCore = [lesson.goal, lesson.problemQuestion, lesson.bigIdea].filter(
    (field) => field?.meta.status === 'APPROVED'
  ).length;
  return (
    <div className="workflow-panel">
      <div className="section-intro">
        <span className="eyebrow">Шаг 1 · замысел урока</span>
        <h2>Паспорт педагогического замысла</h2>
        <p>Исходные ограничения и готовность замысла перед детальной разработкой урока.</p>
      </div>
      <div className="workflow-summary-grid">
        <article><span>Курс</span><strong>{course?.title ?? 'Не выбран'}</strong></article>
        <article><span>Урок</span><strong>{lesson.title}</strong></article>
        <article><span>Время</span><strong>{lesson.durationMinutes} минут</strong></article>
        <article><span>Режим</span><strong>{lesson.designFreedom.mode}</strong></article>
        <article><span>Смысловые решения</span><strong>{approvedCore}/3 утверждено</strong></article>
        <article><span>Готовность сценария</span><strong>{context?.readiness.canGenerateScenario ? 'Готов' : 'Нужны решения'}</strong></article>
      </div>
      <div className="workflow-callout">
        <div><strong>Педагогическая технология</strong><p>{lesson.pedagogicalProfile.technology?.value ?? 'Не выбрана'}</p></div>
        <button className="button button-primary" type="button" onClick={onNext}>Перейти к цели и результатам →</button>
      </div>
    </div>
  );
}
