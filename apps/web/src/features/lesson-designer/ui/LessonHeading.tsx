import type { Course } from '../../../entities/course/model.js';
import type { Lesson } from '../../../entities/lesson/model.js';
import { contentFreedomLabels, designModeLabels } from '../../../entities/lesson/presentation.js';

export function LessonHeading({ course, lesson }: { course: Course | null; lesson: Lesson }) {
  return (
    <div className="lesson-heading">
      <div>
        <div className="lesson-heading__breadcrumb">{course?.title} <span>›</span> {course?.sections.find((section) => section.id === lesson.sectionId)?.title}</div>
        <h1>{lesson.title}</h1>
        <div className="lesson-heading__meta">
          <span>{lesson.durationMinutes} минут</span>
          <span>{designModeLabels[lesson.designFreedom.mode]}</span>
          <span>{contentFreedomLabels[lesson.designFreedom.contentFreedom]}</span>
          {lesson.pedagogicalTechnology?.meta.status === 'APPROVED' ? <span>{lesson.pedagogicalTechnology.value.name}</span> : null}
        </div>
      </div>
      <div className="lesson-version"><span>Версия урока</span><strong>v{lesson.version}</strong></div>
    </div>
  );
}
