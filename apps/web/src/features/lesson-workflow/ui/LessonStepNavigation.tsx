import type { useLessonWorkflow } from '../model/useLessonWorkflow.js';

export function LessonStepNavigation({ workflow }: { workflow: ReturnType<typeof useLessonWorkflow> }) {
  return (
    <nav className="design-steps" aria-label="Этапы проектирования урока">
      {workflow.steps.map(({ step, number, label, state }) => (
        <button
          type="button"
          key={number}
          className={`design-step is-${state} ${workflow.activeStep === step ? 'is-current' : ''}`}
          aria-current={workflow.activeStep === step ? 'step' : undefined}
          aria-label={`${number}. ${label}. ${state === 'locked' ? 'Недоступно' : state === 'complete' ? 'Завершено' : state === 'stale' ? 'Требует обновления' : 'Доступно'}`}
          disabled={state === 'locked'}
          onClick={() => void workflow.goTo(step)}
        >
          <span>{number}{state === 'complete' ? ' · ✓' : state === 'stale' ? ' · !' : ''}</span>{label}
        </button>
      ))}
    </nav>
  );
}
