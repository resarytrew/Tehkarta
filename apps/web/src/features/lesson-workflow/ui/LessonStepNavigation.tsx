import type { useLessonWorkflow } from '../model/useLessonWorkflow.js';

export function LessonStepNavigation({ workflow }: { workflow: ReturnType<typeof useLessonWorkflow> }) {
  return (
    <nav className="design-steps" aria-label="Этапы проектирования урока">
      {workflow.steps.map(({ step, number, label }) => (
        <button
          type="button"
          key={number}
          className={`design-step is-available ${workflow.activeStep === step ? 'is-current' : ''}`}
          aria-current={workflow.activeStep === step ? 'step' : undefined}
          onClick={() => void workflow.goTo(step)}
        >
          <span>{number}</span>{label}
        </button>
      ))}
    </nav>
  );
}
