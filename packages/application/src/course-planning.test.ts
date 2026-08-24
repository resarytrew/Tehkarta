import assert from 'node:assert/strict';
import test from 'node:test';
import type { Lesson } from '@tehkarta/domain';
import {
  ApplicationError,
  coursePlanningReadiness,
  recommendMethodology,
  validateCoursePlanDraft,
  type CoursePlan,
  type CourseSourceDocument,
  type ApprovedCourseLessonContext
} from './index.js';

test('course plan validation preserves explicit learning progression', () => {
  const result = validateCoursePlanDraft({
    expectedRevision: 0,
    goals: ['  Сформировать целостное понимание курса  '],
    plannedOutcomes: ['Объяснять причинно-следственные связи'],
    contentSummary: '  Последовательное изучение индустриального общества. ',
    lessons: [
      {
        lessonId: 'lesson-1',
        position: 1,
        topic: 'Индустриальная революция',
        contentSummary: 'Причины и последствия',
        concepts: ['индустриализация'],
        dates: ['1760–1840'],
        personalities: ['Джеймс Уатт'],
        expectedOutcomes: ['Объяснять причины'],
        progressStatus: 'TAUGHT'
      }
    ]
  });

  assert.equal(result.goals[0], 'Сформировать целостное понимание курса');
  assert.equal(result.contentSummary, 'Последовательное изучение индустриального общества.');
  assert.equal(result.lessons[0]?.progressStatus, 'TAUGHT');
  assert.deepEqual(result.lessons[0]?.concepts, ['индустриализация']);
});

test('methodology recommendation identity is bound to approved course context revision', () => {
  const lesson: Lesson = {
    id: 'lesson-2', workspaceId: 'workspace', version: 1, courseId: 'course', sectionId: 'section', order: 2,
    title: 'Общество в движении', durationMinutes: 45, pedagogicalProfile: {},
    designFreedom: { mode: 'BALANCED', contentFreedom: 'TEXTBOOK_PLUS', methodFreedom: 'FLEXIBLE' },
    outcomes: [{ fieldId: 'outcome-1', value: 'Сравнивать социальные группы и объяснять причины изменений.', meta: { revision: 1, source: 'TEACHER', status: 'APPROVED', updatedAt: '2026-08-24T00:00:00.000Z' } }],
    selectedMethods: [], selectedTechniques: [], selectedForms: [], contentItems: []
  };
  const context: ApprovedCourseLessonContext = {
    courseId: 'course', planRevision: 4, contextRevision: '4-sourcehash',
    courseGoals: ['Цель'], plannedOutcomes: ['Результат'], contentSummary: 'Содержание',
    previousLessons: [{ lessonId: 'lesson-1', position: 1, topic: 'Индустриализация', contentSummary: '', concepts: ['индустриализация'], dates: [], personalities: [], expectedOutcomes: [], progressStatus: 'TAUGHT' }],
    currentLesson: { lessonId: 'lesson-2', position: 2, topic: lesson.title, contentSummary: '', concepts: ['социальная структура'], dates: [], personalities: [], expectedOutcomes: [], progressStatus: 'PLANNED' },
    nextLessons: [], sourceFragments: []
  };

  const recommendation = recommendMethodology(lesson, undefined, context).recommendations[0];
  assert.ok(recommendation?.id.includes('4-sourcehash'));
  assert.match(recommendation?.rationale ?? '', /освоенные понятия: индустриализация/);
});

test('course plan rejects duplicate lesson positions', () => {
  assert.throws(
    () => validateCoursePlanDraft({
      expectedRevision: 0,
      goals: ['Цель'],
      plannedOutcomes: ['Результат'],
      contentSummary: '',
      lessons: [
        { lessonId: 'a', position: 1, topic: 'A', contentSummary: '', concepts: [], dates: [], personalities: [], expectedOutcomes: [], progressStatus: 'PLANNED' },
        { lessonId: 'b', position: 1, topic: 'B', contentSummary: '', concepts: [], dates: [], personalities: [], expectedOutcomes: [], progressStatus: 'PLANNED' }
      ]
    }),
    (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED'
  );
});

test('lesson design readiness requires an approved plan and approved source', () => {
  const plan: CoursePlan = {
    id: 'plan',
    workspaceId: 'workspace',
    courseId: 'course',
    revision: 2,
    status: 'APPROVED',
    goals: ['Цель курса'],
    plannedOutcomes: ['Результат курса'],
    contentSummary: 'Содержание',
    lessons: [
      { lessonId: 'lesson', position: 1, topic: 'Тема', contentSummary: 'Содержание урока', concepts: ['понятие'], dates: [], personalities: [], expectedOutcomes: [], progressStatus: 'PLANNED' }
    ],
    updatedAt: '2026-08-24T00:00:00.000Z'
  };
  const source: CourseSourceDocument = {
    bindingId: 'binding',
    documentId: 'document',
    title: 'Рабочая программа',
    sourceRole: 'WORKING_PROGRAM',
    mimeType: 'application/pdf',
    byteSize: 1024,
    checksumSha256: 'a'.repeat(64),
    rightsBasis: 'OPEN_LICENSE',
    processingStatus: 'READY',
    status: 'APPROVED',
    fragmentCount: 3,
    createdAt: '2026-08-24T00:00:00.000Z'
  };

  assert.deepEqual(coursePlanningReadiness({ plan, sources: [source] }), {
    canDesignLessons: true,
    missing: [],
    approvedSourceCount: 1
  });
  assert.equal(coursePlanningReadiness({ plan, sources: [{ ...source, status: 'DRAFT' }] }).canDesignLessons, false);
});
