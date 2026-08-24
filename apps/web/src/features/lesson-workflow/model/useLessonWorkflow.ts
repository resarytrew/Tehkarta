import { useCallback, useEffect, useState } from 'react';
import type { Lesson } from '../../../entities/lesson/model.js';
import { coreDecisionsApproved } from '../../lesson-intent/model/decisionConfig.js';
import { designSteps, type ActiveDesignStep } from './steps.js';

export function useLessonWorkflow(lesson: Lesson | null, onEnter: (step: ActiveDesignStep) => Promise<void>) {
  const [activeStep, setActiveStep] = useState<ActiveDesignStep>(2);

  useEffect(() => {
    if (lesson) setActiveStep(coreDecisionsApproved(lesson) ? 3 : 2);
  }, [lesson?.id]);

  useEffect(() => {
    if (activeStep === 2 && lesson && coreDecisionsApproved(lesson)) setActiveStep(3);
  }, [activeStep, lesson]);

  const goTo = useCallback(async (step: ActiveDesignStep) => {
    await onEnter(step);
    setActiveStep(step);
  }, [onEnter]);
  const next = useCallback(() => goTo(Math.min(8, activeStep + 1) as ActiveDesignStep), [activeStep, goTo]);
  const previous = useCallback(() => goTo(Math.max(1, activeStep - 1) as ActiveDesignStep), [activeStep, goTo]);

  return { activeStep, steps: designSteps, goTo, next, previous };
}
