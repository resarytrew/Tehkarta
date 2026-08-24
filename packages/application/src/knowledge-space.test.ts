import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkKnowledgeDocument, knowledgeTextEmbedding } from './knowledge-space.js';

test('knowledge ingestion preserves required metadata and markdown section provenance', () => {
  const chunks = chunkKnowledgeDocument({
    text: '# Раздел I\n\nПервый учебный фрагмент.\n\nВторой учебный фрагмент.',
    baseMetadata: {
      workspaceId:'workspace', subjectId:'История', grade:9, umkId:'umk-1', documentId:'document-1',
      documentType:'TEXTBOOK', title:'Учебник', sourceRevision:'2026'
    },
    chunkIds:['chunk-1']
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.metadata.section, 'Раздел I');
  assert.equal(chunks[0]?.metadata.grade, 9);
  assert.equal(chunks[0]?.embedding.length, 64);
});

test('local retrieval embedding is normalized and deterministic', () => {
  const first = knowledgeTextEmbedding('Промышленная революция и индустриализация');
  const second = knowledgeTextEmbedding('Промышленная революция и индустриализация');
  assert.deepEqual(first, second);
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-10);
});
