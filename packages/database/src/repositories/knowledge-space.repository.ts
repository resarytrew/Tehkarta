import {
  ApplicationError,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type KnowledgeDocumentMetadata,
  type KnowledgeDocumentType,
  type KnowledgeRetrievalHit,
  type KnowledgeSpace,
  type KnowledgeSpaceRepository
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

interface SpaceRow { id:string; workspace_id:string; subject_id:string; grade:number; umk_id:string; status:KnowledgeSpace['status']; created_at:Date; updated_at:Date }
interface DocumentRow { id:string; knowledge_space_id:string; workspace_id:string; document_type:KnowledgeDocumentType; title:string; mime_type:string; source_revision:string; checksum_sha256:string; status:KnowledgeDocument['status']; chunk_count:number; created_at:Date; published_at:Date|null }
interface RetrievalRow { chunk_id:string; document_id:string; text_content:string; metadata:unknown; lexical_score:number|string; vector_score:number|string; rerank_score:number|string }

function spaceFromRow(row: SpaceRow): KnowledgeSpace {
  return { id:row.id, workspaceId:row.workspace_id, subjectId:row.subject_id, grade:row.grade, umkId:row.umk_id, status:row.status, createdAt:row.created_at.toISOString(), updatedAt:row.updated_at.toISOString() };
}

function documentFromRow(row: DocumentRow): KnowledgeDocument {
  return { id:row.id, knowledgeSpaceId:row.knowledge_space_id, workspaceId:row.workspace_id, documentType:row.document_type, title:row.title, mimeType:row.mime_type, sourceRevision:row.source_revision, checksumSha256:row.checksum_sha256, status:row.status, chunkCount:row.chunk_count, createdAt:row.created_at.toISOString(), ...(row.published_at ? { publishedAt:row.published_at.toISOString() } : {}) };
}

function metadata(value: unknown): KnowledgeDocumentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApplicationError('VALIDATION_FAILED', 'Stored knowledge chunk metadata is invalid.');
  return value as KnowledgeDocumentMetadata;
}

const spaceColumns = 'id, workspace_id, subject_id, grade, umk_id, status, created_at, updated_at';
const documentColumns = 'id, knowledge_space_id, workspace_id, document_type, title, mime_type, source_revision, checksum_sha256, status, chunk_count, created_at, published_at';

export class PostgresKnowledgeSpaceRepository implements KnowledgeSpaceRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: RequestContext): Promise<KnowledgeSpace[]> {
    const result = await this.pool.query<SpaceRow>(`SELECT ${spaceColumns} FROM knowledge_spaces WHERE workspace_id=$1 AND status <> 'ARCHIVED' ORDER BY subject_id, grade, umk_id`, [context.workspaceId]);
    return result.rows.map(spaceFromRow);
  }

  async get(context: RequestContext, knowledgeSpaceId: string): Promise<KnowledgeSpace | null> {
    const result = await this.pool.query<SpaceRow>(`SELECT ${spaceColumns} FROM knowledge_spaces WHERE id=$1 AND workspace_id=$2`, [knowledgeSpaceId, context.workspaceId]);
    return result.rows[0] ? spaceFromRow(result.rows[0]) : null;
  }

  async create(context: RequestContext, space: KnowledgeSpace): Promise<KnowledgeSpace> {
    if (space.workspaceId !== context.workspaceId) throw new ApplicationError('FORBIDDEN', 'Knowledge space belongs to another workspace.');
    const duplicate = await this.pool.query('SELECT id FROM knowledge_spaces WHERE workspace_id=$1 AND subject_id=$2 AND grade=$3 AND umk_id=$4 AND status <> \'ARCHIVED\'', [context.workspaceId, space.subjectId, space.grade, space.umkId]);
    if (duplicate.rowCount) throw new ApplicationError('CONFLICT', 'An active knowledge space already exists for this subject, grade and UMK.');
    const result = await this.pool.query<SpaceRow>(`INSERT INTO knowledge_spaces(id,workspace_id,subject_id,grade,umk_id,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING ${spaceColumns}`, [space.id, context.workspaceId, space.subjectId, space.grade, space.umkId, space.status, context.actorUserId, space.createdAt]);
    return spaceFromRow(result.rows[0]!);
  }

  async listDocuments(context: RequestContext, knowledgeSpaceId: string): Promise<KnowledgeDocument[]> {
    const result = await this.pool.query<DocumentRow>(`SELECT ${documentColumns} FROM knowledge_documents WHERE workspace_id=$1 AND knowledge_space_id=$2 ORDER BY created_at DESC`, [context.workspaceId, knowledgeSpaceId]);
    return result.rows.map(documentFromRow);
  }

  async ingest(context: RequestContext, input: { document: KnowledgeDocument; chunks: KnowledgeChunk[] }): Promise<KnowledgeDocument> {
    if (input.document.workspaceId !== context.workspaceId || input.chunks.some((chunk) => chunk.metadata.workspaceId !== context.workspaceId)) throw new ApplicationError('FORBIDDEN', 'Knowledge document belongs to another workspace.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const space = await client.query('SELECT 1 FROM knowledge_spaces WHERE id=$1 AND workspace_id=$2 AND status <> \'ARCHIVED\' FOR UPDATE', [input.document.knowledgeSpaceId, context.workspaceId]);
      if (!space.rowCount) throw new ApplicationError('NOT_FOUND', 'Knowledge space was not found.');
      const duplicate = await client.query('SELECT id FROM knowledge_documents WHERE knowledge_space_id=$1 AND checksum_sha256=$2 AND source_revision=$3', [input.document.knowledgeSpaceId, input.document.checksumSha256, input.document.sourceRevision]);
      if (duplicate.rowCount) throw new ApplicationError('CONFLICT', 'This document revision has already been ingested.');
      await client.query(`INSERT INTO knowledge_documents(id,knowledge_space_id,workspace_id,document_type,title,mime_type,source_revision,checksum_sha256,status,chunk_count,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'REVIEW',$9,$10,$11)`, [input.document.id,input.document.knowledgeSpaceId,context.workspaceId,input.document.documentType,input.document.title,input.document.mimeType,input.document.sourceRevision,input.document.checksumSha256,input.chunks.length,context.actorUserId,input.document.createdAt]);
      for (const chunk of input.chunks) {
        await client.query(`INSERT INTO knowledge_chunks(id,knowledge_space_id,document_id,workspace_id,ordinal,text_content,metadata,embedding,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::double precision[],$9)`, [chunk.id,input.document.knowledgeSpaceId,input.document.id,context.workspaceId,chunk.ordinal,chunk.text,JSON.stringify(chunk.metadata),chunk.embedding,input.document.createdAt]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    const result = await this.pool.query<DocumentRow>(`SELECT ${documentColumns} FROM knowledge_documents WHERE id=$1 AND workspace_id=$2`, [input.document.id, context.workspaceId]);
    return documentFromRow(result.rows[0]!);
  }

  async publishDocument(context: RequestContext, input: { knowledgeSpaceId:string; documentId:string; at:string }): Promise<KnowledgeDocument> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<DocumentRow>(`UPDATE knowledge_documents SET status='PUBLISHED',published_by=$1,published_at=$2 WHERE id=$3 AND knowledge_space_id=$4 AND workspace_id=$5 AND status='REVIEW' RETURNING ${documentColumns}`, [context.actorUserId,input.at,input.documentId,input.knowledgeSpaceId,context.workspaceId]);
      const row = result.rows[0];
      if (!row) throw new ApplicationError('CONFLICT', 'Only a document in review can be published.');
      await client.query("UPDATE knowledge_spaces SET status='PUBLISHED',updated_at=$1 WHERE id=$2 AND workspace_id=$3 AND status='DRAFT'", [input.at,input.knowledgeSpaceId,context.workspaceId]);
      await client.query('COMMIT');
      return documentFromRow(row);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async retrieve(context: RequestContext, input: { knowledgeSpaceId:string; query:string; queryEmbedding:number[]; documentTypes?:KnowledgeDocumentType[]; limit:number }): Promise<KnowledgeRetrievalHit[]> {
    const types = input.documentTypes ?? null;
    const result = await this.pool.query<RetrievalRow>(
      `WITH scored AS (
         SELECT k.id AS chunk_id, k.document_id, k.text_content, k.metadata,
                ts_rank_cd(k.search_vector, websearch_to_tsquery('simple',$3))::float8 AS lexical_score,
                greatest(0, COALESCE((SELECT sum(pair.chunk_value * pair.query_value)
                  FROM unnest(k.embedding,$4::double precision[]) AS pair(chunk_value,query_value)),0))::float8 AS vector_score
         FROM knowledge_chunks k
         JOIN knowledge_documents d ON d.id=k.document_id AND d.knowledge_space_id=k.knowledge_space_id AND d.workspace_id=k.workspace_id
         JOIN knowledge_spaces s ON s.id=k.knowledge_space_id AND s.workspace_id=k.workspace_id
         WHERE k.workspace_id=$1 AND k.knowledge_space_id=$2 AND d.status='PUBLISHED' AND s.status='PUBLISHED'
           AND ($5::text[] IS NULL OR d.document_type=ANY($5::text[]))
       )
       SELECT *, (0.55*lexical_score + 0.35*vector_score + 0.10)::float8 AS rerank_score
       FROM scored WHERE lexical_score > 0 OR vector_score > 0
       ORDER BY rerank_score DESC, chunk_id LIMIT $6`,
      [context.workspaceId,input.knowledgeSpaceId,input.query,input.queryEmbedding,types,input.limit]
    );
    return result.rows.map((row) => ({ chunkId:row.chunk_id, documentId:row.document_id, text:row.text_content, metadata:metadata(row.metadata), lexicalScore:Number(row.lexical_score), vectorScore:Number(row.vector_score), rerankScore:Number(row.rerank_score) }));
  }
}
