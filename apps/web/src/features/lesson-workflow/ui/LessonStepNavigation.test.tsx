import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { designSteps } from '../model/steps.js';
import { LessonStepNavigation } from './LessonStepNavigation.js';

test('step navigation exposes the current step and delegates navigation', () => {
  const goTo = vi.fn(async () => undefined);
  render(<LessonStepNavigation workflow={{ activeStep: 3, steps: designSteps, goTo, next: vi.fn(), previous: vi.fn() }} />);
  expect(screen.getByRole('button', { name: /03.*Методический конструктор/ }).getAttribute('aria-current')).toBe('step');
  fireEvent.click(screen.getByRole('button', { name: /04.*Содержание УМК/ }));
  expect(goTo).toHaveBeenCalledWith(4);
});
