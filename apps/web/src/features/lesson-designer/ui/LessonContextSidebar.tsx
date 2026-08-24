import type { Course } from '../../../entities/course/model.js';
import { contentFreedomLabels } from '../../../entities/lesson/presentation.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { stepContextLabels, type ActiveDesignStep } from '../../lesson-workflow/model/steps.js';
import type { LessonWorkspace } from '../model/useLessonWorkspace.js';
import { InvalidationPanel } from './InvalidationPanel.js';

export function LessonContextSidebar({ workspace, course, activeStep }: { workspace: LessonWorkspace; course: Course | null; activeStep: ActiveDesignStep }) {
  const notifications = useNotifications();
  const lesson = workspace.lesson;
  if (!lesson) return null;
  return (
    <aside className="workspace-side-column">
      <InvalidationPanel invalidations={workspace.invalidations} onRecalculate={() => notifications.info('Пересчёт выполняется отдельным управляемым действием; текущие блоки остаются устаревшими до решения педагога.')} />
      <div className="context-panel">
        <span className="eyebrow">{stepContextLabels[activeStep]}</span>
        <h3>Что уже зафиксировано</h3>
        <div className="context-list">
          <div><span>Педагогическая технология</span><strong>{lesson.pedagogicalTechnology?.meta.status === 'APPROVED' ? lesson.pedagogicalTechnology.value.name : 'Не выбрана'}</strong></div>
          <div><span>Режим содержания</span><strong>{contentFreedomLabels[lesson.designFreedom.contentFreedom]}</strong></div>
          <div><span>УМК</span><strong>{workspace.contentContext?.contentPack.title ?? course?.contentPackId ?? 'Не привязан'}</strong></div>
          <div><span>Утверждённых результатов</span><strong>{lesson.outcomes.filter((field) => field.meta.status === 'APPROVED').length}</strong></div>
          <div><span>Утверждённых методов</span><strong>{lesson.selectedMethods.filter((field) => field.meta.status === 'APPROVED').length}</strong></div>
          {activeStep === 2 ? <div><span>AI-запросов по уроку</span><strong>{workspace.proposals.length}</strong></div> : activeStep === 3 ? <div><span>Активных рекомендаций</span><strong>{workspace.methodology?.recommendations.length ?? 0}</strong></div> : <>
            <div><span>Обязательное ядро РП</span><strong>{workspace.contentContext?.approvedContentSet.mandatoryRequirementIds.length ?? 0}</strong></div>
            <div><span>Включено из УМК</span><strong>{workspace.contentContext?.approvedContentSet.includedUmkMappingIds.length ?? 0}</strong></div>
            <div><span>Без решения</span><strong>{workspace.contentContext?.approvedContentSet.undecidedUmkMappingIds.length ?? 0}</strong></div>
          </>}
        </div>
      </div>
      {activeStep === 3 && workspace.methodology?.pack.technology.antiPatterns.length ? <div className="context-panel methodology-warning-panel"><span className="eyebrow">Методическая защита</span><h3>Чего не должна делать технология</h3><ul>{workspace.methodology.pack.technology.antiPatterns.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {activeStep === 4 ? <div className="context-panel methodology-warning-panel"><span className="eyebrow">Защита источников</span><h3>Что платформа не подменяет</h3><ul><li>Непроверенная привязка не выдаётся за содержание УМК.</li><li>Ограниченный лицензией текст не передаётся в браузер.</li><li>AI-дополнение не маркируется как РП или учебник.</li></ul></div> : null}
    </aside>
  );
}
