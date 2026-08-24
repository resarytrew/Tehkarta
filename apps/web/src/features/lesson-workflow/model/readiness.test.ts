import { expect, test } from 'vitest';
import { approvedField, lessonFixture } from '../../../test/fixtures.js';
import { deriveWorkflowStepStates } from './readiness.js';
import { stepRefreshDependencies } from './steps.js';

test('each downstream step declares only the resources it consumes on entry', () => {
  expect(stepRefreshDependencies[4]).toEqual(['content']);
  expect(stepRefreshDependencies[5]).toEqual(['lesson', 'scenario', 'content']);
  expect(stepRefreshDependencies[6]).toEqual(['scenario', 'artifacts']);
  expect(stepRefreshDependencies[7]).toEqual(['scenario', 'artifacts']);
});

test('readiness locks downstream steps until pedagogical prerequisites are complete', () => {
  const states = deriveWorkflowStepStates({ lesson: lessonFixture(), content: null, context: null, artifacts: [], expertiseReady: false });
  expect(states).toMatchObject({ 2: 'available', 3: 'locked', 4: 'locked', 5: 'locked' });
});

test('readiness marks scenario and downstream steps stale after lesson version changes', () => {
  const lesson = lessonFixture({
    version: 7,
    goal: approvedField('Цель', 'goal'),
    problemQuestion: approvedField('Вопрос', 'question'),
    bigIdea: approvedField('Идея', 'idea'),
    pedagogicalProfile: {
      style: approvedField('CONSTRUCTIVIST' as const, 'profile-style'),
      communicationTone: approvedField('SUPPORTIVE' as const, 'profile-tone'),
      focus: approvedField('DEPTH' as const, 'profile-focus')
    },
    pedagogicalTechnology: approvedField({ technologyId: 'inquiry', name: 'Исследовательское обучение', methodologyPackId: 'research-v1', methodologyPackVersion: '1.0.0' }, 'technology'),
    selectedMethods: [approvedField({ methodId: 'inquiry-method', name: 'Исследовательский метод', technologyId: 'inquiry', methodologyPackId: 'research-v1', methodologyPackVersion: '1.0.0', targetOutcomeFieldId: 'outcome', targetOutcomeRevision: 1, technologyRevision: 1, pedagogicalProfileRevision: '1-1-1' }, 'method')],
    selectedForms: [approvedField({ formId: 'groups', name: 'Групповая работа', methodId: 'inquiry-method', methodologyPackId: 'research-v1', methodologyPackVersion: '1.0.0' }, 'form')]
  });
  const content = {
    lessonId: lesson.id, courseId: lesson.courseId, contentMode: 'TEXTBOOK_PLUS' as const,
    curriculumPack: { id: 'rp', version: '1', title: 'РП' }, contentPack: { id: 'umk', version: '1', title: 'УМК' },
    curriculumRequirements: [], umkEvidence: [],
    approvedContentSet: { mandatoryRequirementIds: [], includedUmkMappingIds: [], excludedUmkMappingIds: [], undecidedUmkMappingIds: [] },
    aiSupplemental: [] as []
  };
  const scenario = {
    id: 'scenario', workspaceId: lesson.workspaceId, lessonId: lesson.id, kind: 'SCENARIO' as const, revision: 2,
    payload: { stages: [], generatedFromLessonVersion: 6 }, updatedBy: 'teacher', createdAt: '', updatedAt: ''
  };
  const states = deriveWorkflowStepStates({ lesson, content, context: null, artifacts: [scenario], expertiseReady: false });
  expect(states[5]).toBe('stale');
  expect(states[6]).toBe('stale');
});
