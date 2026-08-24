import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { designSteps } from '../model/steps.js';
import { LessonStepNavigation } from './LessonStepNavigation.js';

test('step navigation exposes the current step and delegates navigation', () => {
  const goTo = vi.fn(async () => true);
  const steps = designSteps.map((step) => ({ ...step, state: 'available' as const }));
  render(<LessonStepNavigation workflow={{ activeStep: 3, steps, goTo, next: vi.fn(), previous: vi.fn() }} />);
  expect(screen.getByRole('button', { name: /03.*Методический конструктор/ }).getAttribute('aria-current')).toBe('step');
  fireEvent.click(screen.getByRole('button', { name: /04.*Содержание УМК/ }));
  expect(goTo).toHaveBeenCalledWith(4);
});

test('step navigation disables locked steps and identifies stale ones', () => {
  const goTo = vi.fn(async () => true);
  const steps = designSteps.map((step) => ({ ...step, state: step.step === 4 ? 'locked' as const : step.step === 5 ? 'stale' as const : 'available' as const }));
  render(<LessonStepNavigation workflow={{ activeStep: 3, steps, goTo, next: vi.fn(), previous: vi.fn() }} />);
  expect((screen.getByRole('button', { name: /04.*Недоступно/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /05.*Требует обновления/ }) as HTMLButtonElement).disabled).toBe(false);
});
