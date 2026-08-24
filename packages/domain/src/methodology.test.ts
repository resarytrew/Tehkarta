import assert from 'node:assert/strict';
import test from 'node:test';
import { researchMethodologyPackV1, validateMethodologyPack } from './methodology.js';

test('research methodology pack has valid cross-references and time ranges', () => {
  assert.deepEqual(validateMethodologyPack(researchMethodologyPackV1), []);
});

test('group work exists only as an organizational form, never as a method', () => {
  assert.equal(researchMethodologyPackV1.forms.some((form) => form.id === 'group'), true);
  assert.equal(researchMethodologyPackV1.methods.some((method) => method.id === 'group'), false);
});

test('every technique references a real method', () => {
  const methodIds = new Set(researchMethodologyPackV1.methods.map((method) => method.id));
  for (const technique of researchMethodologyPackV1.techniques) {
    assert.ok(technique.methodIds.length > 0);
    for (const methodId of technique.methodIds) assert.equal(methodIds.has(methodId), true);
  }
});

test('all methodology time ranges are positive and ordered', () => {
  for (const item of [
    ...researchMethodologyPackV1.phases,
    ...researchMethodologyPackV1.methods,
    ...researchMethodologyPackV1.techniques
  ]) {
    assert.ok(item.typicalMinutes.min > 0);
    assert.ok(item.typicalMinutes.max >= item.typicalMinutes.min);
  }
});
