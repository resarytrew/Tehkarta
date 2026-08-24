import { useCallback, useEffect, useMemo, useState } from 'react';
import { coreDecisionsApproved } from '../../lesson-intent/model/decisionConfig.js';
import { buildWorkflowSteps, type WorkflowReadinessInput } from './readiness.js';
import type { ActiveDesignStep } from './steps.js';

export function useLessonWorkflow(readiness: WorkflowReadinessInput, onEnter: (step: ActiveDesignStep) => Promise<void>) {
  const { lesson } = readiness;
  const [activeStep, setActiveStep] = useState<ActiveDesignStep>(2);
  const steps = useMemo(() => buildWorkflowSteps(readiness), [readiness.artifacts, readiness.content, readiness.context, readiness.expertiseReady, readiness.lesson]);
  const stepStates = useMemo(() => new Map(steps.map((step) => [step.step, step.state])), [steps]);

  useEffect(() => {
    if (lesson) setActiveStep(coreDecisionsApproved(lesson) ? 3 : 2);
  }, [lesson?.id]);

  useEffect(() => {
    if (activeStep === 2 && lesson && coreDecisionsApproved(lesson)) setActiveStep(3);
  }, [activeStep, lesson]);

  const goTo = useCallback(async (step: ActiveDesignStep) => {
    if (stepStates.get(step) === 'locked') return false;
    await onEnter(step);
    setActiveStep(step);
    return true;
  }, [onEnter, stepStates]);
  const next = useCallback(() => goTo(Math.min(8, activeStep + 1) as ActiveDesignStep), [activeStep, goTo]);
  const previous = useCallback(() => goTo(Math.max(1, activeStep - 1) as ActiveDesignStep), [activeStep, goTo]);

  return { activeStep, steps, goTo, next, previous };
}
