import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CreateKnowledgeSpace, IngestKnowledgeDocument, PublishKnowledgeDocument, RetrieveKnowledge } from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import { createPostgresPool, databaseConfigFromEnv } from './index.js';
import { PostgresKnowledgeSpaceRepository } from './repositories/knowledge-space.repository.js';

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl) throw new Error('DATABASE_URL is required for knowledge-space smoke test.');
const suffix=randomUUID(); const userId=`usr_knowledge_${suffix}`; const workspaceId=`ws_knowledge_${suffix}`;
const pool=createPostgresPool({...databaseConfigFromEnv({DATABASE_URL:databaseUrl}),applicationName:'tehkarta-knowledge-smoke',maxConnections:2});
const context:RequestContext={requestId:`request-${suffix}`,workspaceId,actorUserId:userId,roles:['OWNER'],permissions:['knowledge:read','knowledge:write']};
const clock={now:()=>new Date('2026-08-24T00:00:00.000Z')}; const ids={generate:(prefix='id')=>`${prefix}_${randomUUID()}`};
try {
  await pool.query(`INSERT INTO users(id,email,normalized_email,display_name) VALUES($1,$2,$2,'Knowledge Smoke')`,[userId,`knowledge-${suffix}@example.test`]);
  await pool.query(`INSERT INTO workspaces(id,slug,name,created_by) VALUES($1,$2,'Knowledge Smoke',$3)`,[workspaceId,`knowledge-${suffix}`,userId]);
  const repository=new PostgresKnowledgeSpaceRepository(pool);
  const space=await new CreateKnowledgeSpace({repository,clock,ids}).execute(context,{subjectId:'История',grade:9,umkId:'history-9-smoke'});
  const document=await new IngestKnowledgeDocument({repository,clock,ids}).execute(context,{knowledgeSpaceId:space.id,documentType:'TEXTBOOK',title:'Индустриальная революция',mimeType:'text/markdown',sourceRevision:'1',checksumSha256:'a'.repeat(64),text:'# Индустриализация\n\nПромышленная революция изменила производство, транспорт и социальную структуру общества.'});
  assert.equal(document.status,'REVIEW'); assert.ok(document.chunkCount>0);
  const published=await new PublishKnowledgeDocument({repository,clock}).execute(context,space.id,document.id);
  assert.equal(published.status,'PUBLISHED');
  const hits=await new RetrieveKnowledge(repository).execute(context,{knowledgeSpaceId:space.id,query:'Как промышленная революция изменила производство?',limit:5});
  assert.ok(hits.length>0); assert.equal(hits[0]?.metadata.workspaceId,workspaceId); assert.equal(hits[0]?.metadata.subjectId,'История'); assert.equal(hits[0]?.metadata.grade,9); assert.equal(hits[0]?.metadata.umkId,'history-9-smoke'); assert.ok((hits[0]?.rerankScore??0)>0);
  console.log('[database] Knowledge Space ingestion + publish + hybrid retrieval smoke test passed');
} finally {
  await pool.query('DELETE FROM knowledge_spaces WHERE workspace_id=$1',[workspaceId]);
  await pool.query('DELETE FROM workspaces WHERE id=$1',[workspaceId]);
  await pool.query('DELETE FROM users WHERE id=$1',[userId]);
  await pool.end();
}
