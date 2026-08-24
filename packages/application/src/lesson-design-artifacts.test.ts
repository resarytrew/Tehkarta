import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from './index.js';
import { validateLessonDesignArtifact } from './lesson-design-artifacts.js';

test('scenario artifact accepts bounded teacher and student actions', () => {
  assert.doesNotThrow(() =>
    validateLessonDesignArtifact('SCENARIO', {
      stages: [
        {
          id: 'stage-1',
          title: 'Постановка проблемы',
          minutes: 10,
          teacherAction: 'Задаёт проблемный вопрос.',
          studentAction: 'Формулируют гипотезы.'
        }
      ]
    })
  );
});

test('materials artifact rejects a non-boolean readiness flag', () => {
  assert.throws(
    () =>
      validateLessonDesignArtifact('MATERIALS', {
        items: [{ id: 'm-1', title: 'Лист', purpose: 'Работа', ready: 'yes' }]
      }),
    (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED'
  );
});
