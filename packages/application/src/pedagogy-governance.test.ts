import assert from 'node:assert/strict';
import test from 'node:test';
import type { Lesson } from '@tehkarta/domain';
import type { RequestContext } from '@tehkarta/ports';
import { ApprovePedagogicalTechnology, EditPedagogicalProfileDecision, TECHNOLOGY_IMPACT } from './pedagogy-governance.js';
import { ApplyMethodologyRecommendation, recommendMethodology } from './methodology.js';
import { ApplicationError } from './index.js';
import type { LessonInvalidationRepository } from './lesson-governance.js';
import type { LessonRepository } from './index.js';

const context:RequestContext={requestId:'request',workspaceId:'workspace',actorUserId:'teacher',roles:['OWNER'],permissions:['lesson:write']};
function lessonFixture():Lesson{return {id:'lesson',workspaceId:'workspace',version:3,courseId:'course',sectionId:'section',order:1,title:'Урок',durationMinutes:45,pedagogicalProfile:{},designFreedom:{mode:'BALANCED',contentFreedom:'TEXTBOOK_PLUS',methodFreedom:'FLEXIBLE'},outcomes:[],selectedMethods:[],selectedTechniques:[],selectedForms:[],contentItems:[]};}

function dependencies() {
  let lesson=lessonFixture(); let affected:string[]=[];
  const lessons:LessonRepository={async listSummariesByCourse(){return[];},async getById(){return lesson;},async save(_context,next,options){assert.equal(options.expectedVersion,lesson.version);lesson={...next,version:lesson.version+1};return lesson;}};
  const invalidations:LessonInvalidationRepository={async markStale(_context,input){affected=[...input.affectedSemanticKeys];},async listOpen(){return affected.map((key,index)=>({id:`i-${index}`,lessonId:lesson.id,sourceDecisionId:'source',sourceRevision:1,affectedSemanticKey:key,status:'STALE',createdAt:'2026-08-24T00:00:00.000Z'}));}};
  return {lessons,invalidations,clock:{now:()=>new Date('2026-08-24T00:00:00.000Z')},ids:{generate:(prefix='id')=>`${prefix}-1`},read:()=>lesson,write:(next:Lesson)=>{lesson=next;},affected:()=>affected};
}

test('teacher profile edit remains unapproved and invalidates only its declared downstream decisions',async()=>{
  const deps=dependencies(); const command=new EditPedagogicalProfileDecision(deps);
  const result=await command.execute(context,{lessonId:'lesson',key:'pedagogicalFocus',value:'DEPTH',expectedLessonVersion:3});
  assert.equal(result.lesson.pedagogicalProfile.focus?.meta.status,'EDITED');
  assert.ok(deps.affected().includes('method'));
  assert.ok(deps.affected().includes('stage'));
  assert.equal(deps.affected().includes('goal'),false);
});

test('recommendation generated for a previous technology revision is rejected as stale',async()=>{
  const deps=dependencies();
  const meta={revision:1,source:'TEACHER' as const,status:'APPROVED' as const,updatedAt:'2026-08-24T00:00:00.000Z'};
  const lesson={...deps.read(),pedagogicalProfile:{style:{fieldId:'style',value:'CONSTRUCTIVIST' as const,meta},communicationTone:{fieldId:'tone',value:'SUPPORTIVE' as const,meta},focus:{fieldId:'focus',value:'DEPTH' as const,meta}},pedagogicalTechnology:{fieldId:'technology',value:{technologyId:'research-technology',name:'Исследовательская технология',methodologyPackId:'methodology-research-v1',methodologyPackVersion:'1.0.0'},meta},outcomes:[{fieldId:'outcome',value:'Объяснять причины и обосновывать вывод доказательствами.',meta}]};
  deps.write(lesson);
  const old=recommendMethodology(lesson).recommendations[0]!;
  deps.write({...lesson,pedagogicalTechnology:{fieldId:'technology',value:{technologyId:'problem-based-technology',name:'Проблемное обучение',methodologyPackId:'methodology-problem-based-v1',methodologyPackVersion:'1.0.0'},meta:{...meta,revision:2}}});
  const command=new ApplyMethodologyRecommendation(deps);
  await assert.rejects(()=>command.execute(context,{lessonId:'lesson',recommendationId:old.id,methodId:old.method.id,formId:old.compatibleForms[0]!.id,expectedLessonVersion:3}),(error:unknown)=>error instanceof ApplicationError&&error.code==='DEPENDENCY_STALE');
});

test('technology approval is teacher-authored and invalidates every methodology-dependent artifact',async()=>{
  const deps=dependencies(); const command=new ApprovePedagogicalTechnology(deps);
  const result=await command.execute(context,{lessonId:'lesson',technologyId:'problem-based-technology',packId:'methodology-problem-based-v1',packVersion:'1.0.0',expectedLessonVersion:3});
  assert.equal(result.lesson.pedagogicalTechnology?.meta.status,'APPROVED');
  assert.equal(result.lesson.pedagogicalTechnology?.meta.source,'TEACHER');
  assert.deepEqual(deps.affected(),[...TECHNOLOGY_IMPACT]);
});
