import { useEffect, useState } from 'react';
import { logout } from '../shared/auth/sessionApi.js';
import { useSessionActions } from '../shared/auth/SessionActions.js';
import { useApiClient } from '../shared/api/ApiProvider.js';
import { useNotifications } from '../shared/notifications/NotificationProvider.js';
import { CoursePlanningPanel } from '../features/course-planning/ui/CoursePlanningPanel.js';
import { useCoursePlanning } from '../features/course-planning/model/useCoursePlanning.js';
import { LessonDesigner } from '../features/lesson-designer/ui/LessonDesigner.js';
import { AppShell } from './AppShell.js';
import { CourseSidebar } from './CourseSidebar.js';
import { useCourseWorkspace } from './useCourseWorkspace.js';
import { useWorkspaceCatalog } from './useWorkspaceCatalog.js';
import { useWorkspaceSelection } from './useWorkspaceSelection.js';
import { KnowledgeSpacePanel } from '../features/knowledge-space/ui/KnowledgeSpacePanel.js';

export function TeacherWorkspace() {
  const api = useApiClient();
  const session = useSessionActions();
  const notifications = useNotifications();
  const selection = useWorkspaceSelection();
  const catalog = useWorkspaceCatalog();
  const selectedCourseExists = catalog.courses.some((item) => item.id === selection.selectedCourseId);
  const fallbackCourseId = selectedCourseExists ? selection.selectedCourseId : catalog.courses[0]?.id ?? null;
  const courseWorkspace = useCourseWorkspace(fallbackCourseId);
  const planning = useCoursePlanning(fallbackCourseId);
  const [knowledgeAdminActive, setKnowledgeAdminActive] = useState(false);

  useEffect(() => {
    if (!catalog.loading && fallbackCourseId && fallbackCourseId !== selection.selectedCourseId) {
      selection.selectCourse(fallbackCourseId);
    }
  }, [catalog.loading, fallbackCourseId, selection.selectedCourseId, selection.selectCourse]);

  useEffect(() => {
    if (
      selection.selectedLessonId &&
      !courseWorkspace.loading &&
      courseWorkspace.course &&
      !courseWorkspace.lessons.some((lesson) => lesson.id === selection.selectedLessonId)
    ) {
      selection.clearLessonSelection();
    }
  }, [courseWorkspace.course, courseWorkspace.lessons, courseWorkspace.loading, selection.clearLessonSelection, selection.selectedLessonId]);

  useEffect(() => {
    if (selection.selectedLessonId && planning.snapshot && !planning.snapshot.readiness.canDesignLessons) {
      selection.clearLessonSelection();
    }
  }, [planning.snapshot, selection.clearLessonSelection, selection.selectedLessonId]);

  function openLesson(lessonId: string) {
    if (!fallbackCourseId) return;
    if (!planning.snapshot?.readiness.canDesignLessons) {
      selection.clearLessonSelection();
      notifications.warning('Сначала сохраните и утвердите план курса и хотя бы один источник.');
      return;
    }
    setKnowledgeAdminActive(false);
    selection.selectLesson(fallbackCourseId, lessonId);
  }

  async function signOut() {
    try { await logout(api); } catch { /* Local credentials are cleared even if the session expired. */ }
    finally { session.endSession(); }
  }

  if (catalog.error && catalog.courses.length === 0) {
    return <main className="connection-page"><div className="connection-card connection-card--error"><div className="brand-mark brand-mark--large">ТК</div><span className="eyebrow">Не удалось открыть рабочее пространство</span><h1>Рабочая область недоступна</h1><p>{catalog.error}</p><div className="connection-error-actions"><button className="button button-primary" type="button" onClick={() => void catalog.refresh()}>Повторить</button><button className="button button-ghost" type="button" onClick={session.endSession}>Войти заново</button></div></div></main>;
  }

  const course = courseWorkspace.course;
  const showCoursePlanning = !selection.selectedLessonId && !knowledgeAdminActive;
  const knowledgeAdminAvailable = catalog.me?.workspace.role === 'OWNER' || catalog.me?.workspace.role === 'ADMIN' || catalog.me?.workspace.permissions.includes('knowledge:write') === true;
  return (
    <AppShell
      me={catalog.me}
      course={course}
      loading={catalog.loading || courseWorkspace.loading || planning.loading}
      error={courseWorkspace.error}
      onSignOut={() => void signOut()}
      sidebar={<CourseSidebar courses={catalog.courses} selectedCourseId={course?.id ?? fallbackCourseId} course={course} lessons={courseWorkspace.lessons} selectedLessonId={showCoursePlanning ? null : selection.selectedLessonId} onSelectCourse={(courseId)=>{setKnowledgeAdminActive(false);selection.selectCourse(courseId);}} onSelectLesson={openLesson} onOpenCoursePlan={()=>{setKnowledgeAdminActive(false);selection.clearLessonSelection();}} coursePlanActive={showCoursePlanning} knowledgeAdminAvailable={knowledgeAdminAvailable} knowledgeAdminActive={knowledgeAdminActive} onOpenKnowledgeAdmin={()=>{selection.clearLessonSelection();setKnowledgeAdminActive(true);}} />}
    >
      {knowledgeAdminActive ? <KnowledgeSpacePanel course={course} onCourseLinked={courseWorkspace.refresh} /> : showCoursePlanning && course && planning.snapshot ? (
        <CoursePlanningPanel
          key={`${course.id}:${planning.snapshot.plan?.revision ?? 0}:${planning.snapshot.sources.length}`}
          course={course}
          lessons={courseWorkspace.lessons}
          snapshot={planning.snapshot}
          busyAction={planning.busyAction}
          onSave={planning.save}
          onApprove={planning.approve}
          onUpload={planning.upload}
          onApproveSource={planning.approveSource}
          onOpenLesson={openLesson}
        />
      ) : selection.selectedLessonId ? (
        <LessonDesigner lessonId={selection.selectedLessonId} course={course} onLessonVersionChange={courseWorkspace.updateLessonVersion} />
      ) : (
        <div className="empty-workspace"><div className="empty-workspace__icon">＋</div><h2>В курсе пока нет уроков</h2><p>Следующий шаг — создание урока из структуры рабочей программы.</p></div>
      )}
    </AppShell>
  );
}
