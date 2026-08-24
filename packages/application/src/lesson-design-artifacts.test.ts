import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from './index.js';
import { validateLessonDesignArtifact, validateScenarioAgainstApprovedContext } from './lesson-design-artifacts.js';
import type { ApprovedScenarioContext } from './scenario-context.js';

test('scenario artifact accepts bounded teacher and student actions', () => {
  assert.doesNotThrow(() =>
    validateLessonDesignArtifact('SCENARIO', {
      stages: [
        {
          id: 'stage-1',
          title: 'Постановка проблемы',
          minutes: 10,
          teacherAction: 'Задаёт проблемный вопрос.',
          studentAction: 'Формулируют гипотезы.',
          technologyPhaseIds: ['problem']
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

const approvedContext:ApprovedScenarioContext={
  course:{id:'course',subject:'История',grade:9,academicYear:'2026/27',title:'Курс'},section:{id:'section',title:'Раздел',plannedHours:5},lesson:{id:'lesson',version:7,title:'Урок',order:1,durationMinutes:45,designFreedom:{mode:'BALANCED',contentFreedom:'TEXTBOOK_PLUS',methodFreedom:'FLEXIBLE'}},concept:{goal:'Цель',problemQuestion:'Вопрос',bigIdea:'Идея'},outcomes:['Результат'],pedagogicalProfile:{style:'CONSTRUCTIVIST',communicationTone:'SUPPORTIVE',focus:'DEPTH'},methodology:{technology:{technologyId:'research-technology',name:'Исследовательская технология',methodologyPackId:'methodology-research-v1',methodologyPackVersion:'1.0.0'},technologyRevision:2,pedagogicalProfileRevision:'1-1-1',canonicalPhases:[{id:'problem',title:'Проблема',purpose:'Поставить вопрос'},{id:'evidence',title:'Доказательства',purpose:'Проверить версии'}],methods:['Проверка гипотез'],techniques:[],forms:['Работа в паре'],methodSelections:[],techniqueSelections:[],formSelections:[]},content:{mandatoryRp:[],includedUmk:[]},readiness:{canGenerateScenario:true,missing:[],undecidedUmkCount:0,excludedUmkCount:0}
};

test('scenario conformity requires current grounding and coverage of every technology phase',()=>{
  const payload={generatedFromLessonVersion:7,technologyId:'research-technology',methodologyPackId:'methodology-research-v1',methodologyPackVersion:'1.0.0',technologyRevision:2,pedagogicalProfileRevision:'1-1-1',stages:[{id:'stage-1',title:'Этап 1',minutes:20,teacherAction:'Ставит проблему',studentAction:'Формулируют версии',technologyPhaseIds:['problem']},{id:'stage-2',title:'Этап 2',minutes:25,teacherAction:'Организует проверку',studentAction:'Анализируют доказательства',technologyPhaseIds:['evidence']}]};
  assert.doesNotThrow(()=>validateScenarioAgainstApprovedContext(payload,approvedContext));
  assert.throws(()=>validateScenarioAgainstApprovedContext({...payload,stages:[payload.stages[0]]},approvedContext),(error:unknown)=>error instanceof ApplicationError&&error.code==='VALIDATION_FAILED');
  assert.throws(()=>validateScenarioAgainstApprovedContext({...payload,technologyRevision:1},approvedContext),(error:unknown)=>error instanceof ApplicationError&&error.code==='DEPENDENCY_STALE');
});
