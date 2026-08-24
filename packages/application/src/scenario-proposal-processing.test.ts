import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from './index.js';
import {
  validateScenarioCandidates,
  type ScenarioCandidate
} from './scenario-proposal-processing.js';
import type { ApprovedScenarioContext } from './scenario-context.js';
import type { LessonScenarioProposal } from './scenario-proposals.js';

const approvedContext: ApprovedScenarioContext = {
  course: {
    id: 'course-1',
    subject: 'История',
    grade: 9,
    academicYear: '2026/27',
    title: 'Всеобщая история'
  },
  sourcePacks: {
    curriculum: { id: 'rp-1', version: '1', title: 'Рабочая программа' },
    content: { id: 'umk-1', version: '1', title: 'УМК' }
  },
  section: { id: 'section-1', title: 'Начало индустриальной эпохи', plannedHours: 7 },
  lesson: {
    id: 'lesson-1',
    version: 12,
    title: 'Экономика делает решающий рывок',
    order: 1,
    durationMinutes: 45,
    designFreedom: {
      mode: 'BALANCED',
      contentFreedom: 'TEXTBOOK_PLUS',
      methodFreedom: 'FLEXIBLE'
    }
  },
  concept: {
    goal: 'Объяснить механизм промышленного рывка XIX века.',
    problemQuestion: 'Почему в XIX в. промышленная революция достигла огромных успехов?'
  },
  outcomes: ['Объяснять причинно-следственные связи индустриализации.'],
  methodology: {
    methods: ['Проверка гипотез'],
    techniques: ['Факт → доказательство → вывод'],
    forms: ['Работа в парах']
  },
  content: {
    mandatoryRp: [
      {
        id: 'rp-1-required',
        kind: 'CONTENT',
        text: 'Вторая промышленная революция.',
        allocationStage: 'MANDATORY',
        allocationScope: 'LESSON',
        source: null
      },
      {
        id: 'rp-2-required',
        kind: 'CONTENT',
        text: 'Монополии.',
        allocationStage: 'MANDATORY',
        allocationScope: 'LESSON',
        source: null
      }
    ],
    includedUmk: [
      {
        mappingId: 'map-included',
        sourceUnitId: 'unit-1',
        relationType: 'PRIMARY',
        mappingScope: 'LESSON',
        resourceType: 'TEXTBOOK',
        unitType: 'PARAGRAPH',
        title: 'Экономика делает решающий рывок',
        textRestricted: true,
        source: {
          sourceId: 'source-1',
          sourceVersion: '1',
          sourceType: 'TEXTBOOK',
          title: 'Учебник',
          rightsBasis: 'TEST_FIXTURE',
          accessLevel: 'METADATA_ONLY'
        },
        selection: { state: 'INCLUDED', revision: 1 }
      }
    ]
  },
  readiness: {
    canGenerateScenario: true,
    missing: [],
    undecidedUmkCount: 0,
    excludedUmkCount: 1
  }
};

const proposal: LessonScenarioProposal = {
  id: 'scenario-proposal-1',
  workspaceId: 'ws-1',
  lessonId: 'lesson-1',
  status: 'RUNNING',
  requestedLessonVersion: 12,
  contextGuard: {
    version: 'scenario-context-v1',
    lessonVersion: 12,
    curriculumPackId: 'rp-1',
    curriculumPackVersion: '1',
    contentPackId: 'umk-1',
    contentPackVersion: '1',
    mandatoryRequirementIds: ['rp-1-required', 'rp-2-required'],
    includedUmkMappingIds: ['map-included']
  },
  candidateCountRequested: 1,
  candidates: [],
  asyncJobId: 'job-1',
  idempotencyKey: 'scenario-request-1',
  requestedBy: 'teacher-1',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z'
};

function validCandidate(): ScenarioCandidate {
  return {
    id: 'candidate-1',
    title: 'Причины промышленного рывка через проверку гипотез',
    rationale: 'Ученики проверяют причинные объяснения на обязательном содержании РП.',
    stages: [
      {
        id: 'stage-1',
        title: 'Постановка проблемы',
        minutes: 5,
        teacherAction: 'Формулирует проблемный вопрос и предлагает исходные гипотезы.',
        studentAction: 'Выбирают и уточняют гипотезы, которые предстоит проверить.',
        techniques: [],
        form: 'Работа в парах',
        contentRefs: [{ kind: 'RP_REQUIREMENT', id: 'rp-1-required' }]
      },
      {
        id: 'stage-2',
        title: 'Проверка первой гипотезы',
        minutes: 15,
        teacherAction: 'Организует работу с доступными сведениями УМК.',
        studentAction: 'Извлекают факты и связывают их с первой гипотезой.',
        method: 'Проверка гипотез',
        techniques: ['Факт → доказательство → вывод'],
        form: 'Работа в парах',
        contentRefs: [
          { kind: 'RP_REQUIREMENT', id: 'rp-1-required' },
          { kind: 'UMK_MAPPING', id: 'map-included' }
        ]
      },
      {
        id: 'stage-3',
        title: 'Проверка второй гипотезы',
        minutes: 15,
        teacherAction: 'Предлагает сопоставить механизм конкуренции и образования монополий.',
        studentAction: 'Строят причинную цепочку и проверяют её фактами.',
        method: 'Проверка гипотез',
        techniques: ['Факт → доказательство → вывод'],
        form: 'Работа в парах',
        contentRefs: [{ kind: 'RP_REQUIREMENT', id: 'rp-2-required' }]
      },
      {
        id: 'stage-4',
        title: 'Вывод',
        minutes: 10,
        teacherAction: 'Возвращает класс к проблемному вопросу.',
        studentAction: 'Формулируют аргументированный ответ на проблемный вопрос.',
        techniques: ['Факт → доказательство → вывод'],
        evidenceOfLearning: 'Ответ содержит причинную связь и опирается на проверенные факты.',
        contentRefs: [
          { kind: 'RP_REQUIREMENT', id: 'rp-1-required' },
          { kind: 'RP_REQUIREMENT', id: 'rp-2-required' }
        ]
      }
    ]
  };
}

function assertInvalid(candidate: ScenarioCandidate, pattern: RegExp): void {
  assert.throws(
    () => validateScenarioCandidates(proposal, approvedContext, [candidate]),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === 'EXTERNAL_SERVICE_FAILED' &&
      pattern.test(error.message)
  );
}

test('valid scenario exactly fits time and approved RP/UMK/methodology constraints', () => {
  const result = validateScenarioCandidates(proposal, approvedContext, [validCandidate()]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.stages.reduce((sum, stage) => sum + stage.minutes, 0), 45);
});

test('scenario cannot reference UMK mapping excluded from teacher-approved content', () => {
  const candidate = validCandidate();
  candidate.stages[1]!.contentRefs.push({ kind: 'UMK_MAPPING', id: 'map-excluded' });
  assertInvalid(candidate, /did not include/);
});

test('scenario cannot silently introduce an unapproved method or technique', () => {
  const wrongMethod = validCandidate();
  wrongMethod.stages[1]!.method = 'Лекция';
  assertInvalid(wrongMethod, /did not approve/);

  const wrongTechnique = validCandidate();
  wrongTechnique.stages[1]!.techniques = ['Скрытый новый приём'];
  assertInvalid(wrongTechnique, /did not approve/);
});

test('scenario must preserve exact lesson duration', () => {
  const candidate = validCandidate();
  candidate.stages[3]!.minutes = 9;
  assertInvalid(candidate, /44 minutes instead of the lesson duration 45/);
});

test('scenario cannot lose any mandatory RP requirement', () => {
  const candidate = validCandidate();
  for (const stage of candidate.stages) {
    stage.contentRefs = stage.contentRefs.filter((ref) => ref.id !== 'rp-2-required');
  }
  assertInvalid(candidate, /does not cover mandatory RP requirements: rp-2-required/);
});
