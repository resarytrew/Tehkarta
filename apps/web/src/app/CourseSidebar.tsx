import type { Course, CourseSummary } from '../entities/course/model.js';
import type { LessonSummary } from '../entities/lesson/model.js';

interface CourseSidebarProps {
  courses: CourseSummary[];
  selectedCourseId: string | null;
  course: Course | null;
  lessons: LessonSummary[];
  selectedLessonId: string | null;
  onSelectCourse(courseId: string): void;
  onSelectLesson(lessonId: string): void;
  onOpenCoursePlan(): void;
  coursePlanActive: boolean;
}

const lessonStateLabel: Record<LessonSummary['state'], string> = {
  PLANNED: 'Запланирован',
  DESIGNING: 'В работе',
  READY: 'Готов',
  ARCHIVED: 'Архив'
};

export function CourseSidebar({
  courses,
  selectedCourseId,
  course,
  lessons,
  selectedLessonId,
  onSelectCourse,
  onSelectLesson,
  onOpenCoursePlan,
  coursePlanActive
}: CourseSidebarProps) {
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  return (
    <aside className="course-sidebar">
      <div className="course-sidebar__top">
        <div className="sidebar-caption">Учебный курс</div>
        <select
          className="course-select"
          value={selectedCourseId ?? ''}
          onChange={(event) => onSelectCourse(event.target.value)}
          aria-label="Выбор курса"
        >
          {courses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subject} · {item.grade} класс
            </option>
          ))}
        </select>
        {course ? (
          <div className="course-meta">
            <strong>{course.title}</strong>
            <span>{course.academicYear} учебный год</span>
          </div>
        ) : null}
        <button
          className={`button course-sidebar__plan-button ${coursePlanActive ? 'button-primary' : 'button-secondary'}`}
          type="button"
          onClick={onOpenCoursePlan}
        >
          План курса и источники
        </button>
      </div>

      <div className="course-tree" aria-label="Разделы и уроки курса">
        {course?.sections.map((section, sectionIndex) => (
          <section className="course-tree__section" key={section.id}>
            <div className="course-tree__section-header">
              <span className="section-number">{String(sectionIndex + 1).padStart(2, '0')}</span>
              <div>
                <strong>{section.title}</strong>
                <span>{section.plannedHours} ч.</span>
              </div>
            </div>
            <div className="course-tree__lessons">
              {section.lessonIds.map((lessonId) => {
                const lesson = lessonsById.get(lessonId);
                const selected = lessonId === selectedLessonId;
                return (
                  <button
                    key={lessonId}
                    type="button"
                    className={`lesson-nav-item ${selected ? 'is-selected' : ''}`}
                    onClick={() => onSelectLesson(lessonId)}
                  >
                    <span className="lesson-nav-item__order">{lesson?.order ?? '·'}</span>
                    <span className="lesson-nav-item__content">
                      <strong>{lesson?.title ?? 'Урок'}</strong>
                      <small>{lesson ? lessonStateLabel[lesson.state] : 'Загрузка…'}</small>
                    </span>
                  </button>
                );
              })}
              {section.lessonIds.length === 0 ? (
                <div className="course-tree__empty">Уроки ещё не добавлены</div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
