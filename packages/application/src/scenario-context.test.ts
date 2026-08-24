import assert from 'node:assert/strict';
import test from 'node:test';
import type { Course, GovernedField, Lesson } from '@tehkarta/domain';
import type { RequestContext } from '@tehkarta/ports';
import {
  BuildApprovedScenarioContext,
  type CoursePlanningRepository,
  type CourseRepository,
  type LessonContentContextRepository,
  type LessonRepository
} from './index.js';

const context: RequestContext = {
  requestId: 'req-scenario-context',
  workspaceId: 'ws-1',
  actorUserId: 'teacher-1',
  roles: ['OWNER'],
  permissions: ['course:read', 'lesson:read', 'lesson:write']
};

function field(
  fieldId: string,
  value: string,
  status: 'PROPOSED' | 'EDITED' | 'APPROVED'
): GovernedField<string> {
  return {
    fieldId,
    value,
    meta: {
      revision: 1,
      source: status === 'PROPOSED' ? 'AI' : 'TEACHER',
      status,
      updatedAt: '2026-08-24T00:00:00.000Z'
    }
  };
}

const course: Course = {
  id: 'course-1',
  workspaceId: 'ws-1',
  version: 1,
  subject: 'История',
  grade: 9,
  academicYear: '2026/27',
  title: 'Всеобщая история',
  curriculumPackId: 'rp-1',
  curriculumPackVersion: '1',
  contentPackId: 'umk-1',
  contentPackVersion: '1',
  sections: [
    {
      id: 'section-1',
      title: 'Начало индустриальной эпохи',
      plannedHours: 7,
      lessonIds: ['lesson-1'],
      requirementIds: ['rp-required']
    }
  ]
};

const lesson: Lesson = {
  id: 'lesson-1',
  workspaceId: 'ws-1',
  version: 7,
  courseId: 'course-1',
  sectionId: 'section-1',
  order: 1,
  title: 'Экономика делает решающий рывок',
  durationMinutes: 45,
  pedagogicalProfile: {},
  designFreedom: {
    mode: 'BALANCED',
    contentFreedom: 'TEXTBOOK_PLUS',
    methodFreedom: 'FLEXIBLE'
  },
  goal: field('goal', 'Объяснить механизм промышленного рывка XIX века.', 'APPROVED'),
  problemQuestion: field(
    'problem',
    'Почему в XIX в. промышленная революция достигла огромных успехов?',
    'APPROVED'
  ),
  bigIdea: field('big-idea', 'Технологии меняют экономическую структуру общества.', 'EDITED'),
  outcomes: [
    field('outcome-approved', 'Объяснять причинно-следственные связи индустриализации.', 'APPROVED'),
    field('outcome-draft', 'Черновой результат не должен попасть в сценарий.', 'EDITED')
  ],
  selectedMethods: [field('method', 'Проверка гипотез', 'APPROVED')],
  selectedTechniques: [field('technique', 'Факт → доказательство → вывод', 'APPROVED')],
  selectedForms: [field('form', 'Работа в парах', 'APPROVED')],
  contentItems: []
};

const lessons: LessonRepository = {
  async listSummariesByCourse() {
    return [];
  },
  async getById(_context, id) {
    return id === lesson.id ? lesson : null;
  },
  async save() {
    throw new Error('not used');
  }
};

const courses: CourseRepository = {
  async listSummaries() {
    return [];
  },
  async getById(_context, id) {
    return id === course.id ? course : null;
  },
  async save() {
    throw new Error('not used');
  }
};

const contentContext: LessonContentContextRepository = {
  async getForLesson() {
    return {
      lessonId: lesson.id,
      courseId: course.id,
      contentMode: 'TEXTBOOK_PLUS',
      curriculumPack: { id: 'rp-1', version: '1', title: 'РП' },
      contentPack: { id: 'umk-1', version: '1', title: 'УМК' },
      curriculumRequirements: [
        {
          id: 'rp-required',
          code: 'RP-01',
          kind: 'CONTENT',
          text: 'Индустриализация, вторая промышленная революция и монополии.',
          allocationStage: 'MANDATORY',
          allocationScope: 'LESSON',
          source: null
        }
      ],
      umkEvidence: [
        {
          mappingId: 'map-included',
          sourceUnitId: 'unit-included',
          relationType: 'PRIMARY',
          mappingScope: 'LESSON',
          resourceType: 'TEXTBOOK',
          unitType: 'CONCEPT',
          title: 'Вторая промышленная революция',
          text: 'Разрешённый тестовый текст.',
          textRestricted: false,
          source: {
            sourceId: 'source-1',
            sourceVersion: '1',
            sourceType: 'TEXTBOOK',
            title: 'Учебник',
            rightsBasis: 'TEST_FIXTURE',
            accessLevel: 'FULL'
          },
          selection: { state: 'INCLUDED', revision: 1 }
        },
        {
          mappingId: 'map-excluded',
          sourceUnitId: 'unit-excluded',
          relationType: 'EXTENSION',
          mappingScope: 'LESSON',
          resourceType: 'TEXTBOOK',
          unitType: 'CONCEPT',
          title: 'Исключённый материал',
          text: 'Этот текст не должен попасть в approved scenario context.',
          textRestricted: false,
          source: {
            sourceId: 'source-1',
            sourceVersion: '1',
            sourceType: 'TEXTBOOK',
            title: 'Учебник',
            rightsBasis: 'TEST_FIXTURE',
            accessLevel: 'FULL'
          },
          selection: { state: 'EXCLUDED', revision: 1 }
        }
      ],
      approvedContentSet: {
        mandatoryRequirementIds: ['rp-required'],
        includedUmkMappingIds: ['map-included'],
        excludedUmkMappingIds: ['map-excluded'],
        undecidedUmkMappingIds: []
      },
      aiSupplemental: []
    };
  }
};

const coursePlanning: CoursePlanningRepository = {
  async getApprovedLessonContext() {
    return {
      courseId: course.id,
      planRevision: 3,
      contextRevision: '3-source-fixture',
      courseGoals: ['Понять переход к индустриальному обществу.'],
      plannedOutcomes: ['Объяснять причинно-следственные связи.'],
      contentSummary: 'Системная логика курса.',
      previousLessons: [],
      currentLesson: {
        lessonId: lesson.id,
        position: 1,
        topic: lesson.title,
        contentSummary: 'Индустриализация.',
        concepts: ['индустриализация'],
        dates: [],
        personalities: [],
        expectedOutcomes: [],
        progressStatus: 'PLANNED'
      },
      nextLessons: [],
      sourceFragments: []
    };
  },
  async getSnapshot() { throw new Error('not used'); },
  async saveDraft() { throw new Error('not used'); },
  async approve() { throw new Error('not used'); },
  async addSource() { throw new Error('not used'); },
  async approveSource() { throw new Error('not used'); }
};

test('scenario context contains only approved pedagogy and teacher-included UMK content', async () => {
  const result = await new BuildApprovedScenarioContext({
    lessons,
    courses,
    contentContext,
    coursePlanning
  }).execute(context, lesson.id);

  assert.equal(result.readiness.canGenerateScenario, true);
  assert.deepEqual(result.readiness.missing, []);
  assert.equal(result.concept.bigIdea, undefined, 'EDITED big idea must not enter authoritative context.');
  assert.deepEqual(result.outcomes, ['Объяснять причинно-следственные связи индустриализации.']);
  assert.deepEqual(result.methodology.methods, ['Проверка гипотез']);
  assert.deepEqual(result.content.mandatoryRp.map((item) => item.id), ['rp-required']);
  assert.deepEqual(result.content.includedUmk.map((item) => item.mappingId), ['map-included']);
  assert.ok(!JSON.stringify(result).includes('Исключённый материал'));
  assert.ok(!JSON.stringify(result).includes('Черновой результат'));
});

test('scenario generation is blocked while an approved UMK mapping remains undecided', async () => {
  const incompleteContent: LessonContentContextRepository = {
    async getForLesson(requestContext, lessonId) {
      const base = await contentContext.getForLesson(requestContext, lessonId);
      if (!base) return null;
      return {
        ...base,
        umkEvidence: [
          ...base.umkEvidence,
          {
            ...base.umkEvidence[0]!,
            mappingId: 'map-undecided',
            sourceUnitId: 'unit-undecided',
            title: 'Материал без решения',
            selection: { state: 'UNDECIDED' }
          }
        ],
        approvedContentSet: {
          ...base.approvedContentSet,
          undecidedUmkMappingIds: ['map-undecided']
        }
      };
    }
  };

  const result = await new BuildApprovedScenarioContext({
    lessons,
    courses,
    contentContext: incompleteContent,
    coursePlanning
  }).execute(context, lesson.id);

  assert.equal(result.readiness.canGenerateScenario, false);
  assert.ok(result.readiness.missing.includes('CONTENT_SELECTION'));
  assert.equal(result.readiness.undecidedUmkCount, 1);
  assert.deepEqual(result.content.includedUmk.map((item) => item.mappingId), ['map-included']);
});

test('scenario generation fails closed without an approved course plan', async () => {
  const result = await new BuildApprovedScenarioContext({ lessons, courses, contentContext })
    .execute(context, lesson.id);

  assert.equal(result.readiness.canGenerateScenario, false);
  assert.ok(result.readiness.missing.includes('COURSE_PLAN'));
  assert.equal(result.coursePlanning, undefined);
});
