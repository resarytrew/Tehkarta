import type { Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { ApplicationError, type CourseRepository } from './index.js';

export type KnowledgeSpaceStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type KnowledgeDocumentStatus = 'REVIEW' | 'PUBLISHED' | 'FAILED';
export type KnowledgeDocumentType = 'WORKING_PROGRAM' | 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'LOCAL_MATERIAL';

export interface KnowledgeSpace {
  id: string;
  workspaceId: string;
  subjectId: string;
  grade: number;
  umkId: string;
  status: KnowledgeSpaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentMetadata {
  workspaceId: string;
  subjectId: string;
  grade: number;
  umkId: string;
  documentId: string;
  documentType: KnowledgeDocumentType;
  title: string;
  section?: string;
  chapter?: string;
  topic?: string;
  pageStart?: number;
  pageEnd?: number;
  sourceRevision: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeSpaceId: string;
  workspaceId: string;
  documentType: KnowledgeDocumentType;
  title: string;
  mimeType: string;
  sourceRevision: string;
  checksumSha256: string;
  status: KnowledgeDocumentStatus;
  chunkCount: number;
  createdAt: string;
  publishedAt?: string;
}

export interface KnowledgeChunk {
  id: string;
  knowledgeSpaceId: string;
  documentId: string;
  ordinal: number;
  text: string;
  metadata: KnowledgeDocumentMetadata;
  embedding: number[];
}

export interface KnowledgeRetrievalHit {
  chunkId: string;
  documentId: string;
  text: string;
  metadata: KnowledgeDocumentMetadata;
  lexicalScore: number;
  vectorScore: number;
  rerankScore: number;
}

export interface KnowledgeSpaceRepository {
  list(context: RequestContext): Promise<KnowledgeSpace[]>;
  get(context: RequestContext, knowledgeSpaceId: string): Promise<KnowledgeSpace | null>;
  create(context: RequestContext, space: KnowledgeSpace): Promise<KnowledgeSpace>;
  listDocuments(context: RequestContext, knowledgeSpaceId: string): Promise<KnowledgeDocument[]>;
  ingest(context: RequestContext, input: { document: KnowledgeDocument; chunks: KnowledgeChunk[] }): Promise<KnowledgeDocument>;
  publishDocument(context: RequestContext, input: { knowledgeSpaceId: string; documentId: string; at: string }): Promise<KnowledgeDocument>;
  retrieve(context: RequestContext, input: { knowledgeSpaceId: string; query: string; queryEmbedding: number[]; documentTypes?: KnowledgeDocumentType[]; limit: number }): Promise<KnowledgeRetrievalHit[]>;
}

const documentTypes = new Set<KnowledgeDocumentType>(['WORKING_PROGRAM', 'TEXTBOOK', 'METHOD_GUIDE', 'ATLAS', 'WORKBOOK', 'ASSESSMENT', 'LOCAL_MATERIAL']);

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be a non-empty string with at most ${max} characters.`);
  }
  return value.trim();
}

function validGrade(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 11) {
    throw new ApplicationError('VALIDATION_FAILED', 'grade must be an integer between 1 and 11.');
  }
  return Number(value);
}

// A bounded local feature-hash embedding keeps ingestion deterministic. The repository
// can later persist provider embeddings without changing the retrieval contract.
export function knowledgeTextEmbedding(text: string, dimensions = 64): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % dimensions;
    vector[bucket] = (vector[bucket] ?? 0) + (hash & 1 ? 1 : -1);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function parsedKnowledgeChunks(text: string): Array<{ text: string; section?: string }> {
  const normalized = cleanText(text, 'text', 2_000_000).replaceAll('\r\n', '\n');
  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: Array<{ text: string; section?: string }> = [];
  let section: string | undefined;
  let buffer = '';
  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push({ text: buffer.trim(), ...(section ? { section } : {}) });
    buffer = '';
  };
  for (const block of blocks) {
    const heading = block.match(/^#{1,4}\s+(.{1,300})$/)?.[1];
    if (heading) { flush(); section = heading.trim(); continue; }
    if (buffer && buffer.length + block.length + 2 > 1_800) flush();
    if (block.length <= 1_800) buffer = buffer ? `${buffer}\n\n${block}` : block;
    else {
      flush();
      for (let offset = 0; offset < block.length; offset += 1_800) {
        chunks.push({ text: block.slice(offset, offset + 1_800), ...(section ? { section } : {}) });
      }
    }
  }
  flush();
  return chunks;
}

export function chunkKnowledgeDocument(input: {
  text: string;
  baseMetadata: Omit<KnowledgeDocumentMetadata, 'section'>;
  chunkIds: string[];
}): KnowledgeChunk[] {
  const chunks = parsedKnowledgeChunks(input.text);
  if (chunks.length !== input.chunkIds.length) {
    throw new ApplicationError('VALIDATION_FAILED', 'Chunk id allocation does not match parsed document structure.');
  }
  return chunks.map((chunk, index) => ({
    id: input.chunkIds[index]!,
    knowledgeSpaceId: '',
    documentId: input.baseMetadata.documentId,
    ordinal: index + 1,
    text: chunk.text,
    metadata: { ...input.baseMetadata, ...(chunk.section ? { section: chunk.section } : {}) },
    embedding: knowledgeTextEmbedding(chunk.text)
  }));
}

function chunkCount(text: string): number {
  return parsedKnowledgeChunks(text).length;
}

export class CreateKnowledgeSpace {
  constructor(private readonly deps: { repository: KnowledgeSpaceRepository; clock: Clock; ids: IdGenerator }) {}

  execute(context: RequestContext, input: { subjectId: string; grade: number; umkId: string }): Promise<KnowledgeSpace> {
    const at = this.deps.clock.now().toISOString();
    return this.deps.repository.create(context, {
      id: this.deps.ids.generate('knowledge_space'), workspaceId: context.workspaceId,
      subjectId: cleanText(input.subjectId, 'subjectId', 200), grade: validGrade(input.grade),
      umkId: cleanText(input.umkId, 'umkId', 200), status: 'DRAFT', createdAt: at, updatedAt: at
    });
  }
}

export interface IngestKnowledgeDocumentInput {
  knowledgeSpaceId: string;
  documentType: KnowledgeDocumentType;
  title: string;
  mimeType: string;
  sourceRevision: string;
  checksumSha256: string;
  text: string;
  chapter?: string;
  topic?: string;
  pageStart?: number;
  pageEnd?: number;
}

export class IngestKnowledgeDocument {
  constructor(private readonly deps: { repository: KnowledgeSpaceRepository; clock: Clock; ids: IdGenerator }) {}

  async execute(context: RequestContext, raw: IngestKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const space = await this.deps.repository.get(context, cleanText(raw.knowledgeSpaceId, 'knowledgeSpaceId', 200));
    if (!space) throw new ApplicationError('NOT_FOUND', 'Knowledge space was not found.');
    if (space.status === 'ARCHIVED') throw new ApplicationError('CONFLICT', 'Archived knowledge space cannot accept documents.');
    if (!documentTypes.has(raw.documentType)) throw new ApplicationError('VALIDATION_FAILED', 'Unsupported documentType.');
    if (!new Set(['application/pdf','text/plain','text/markdown']).has(raw.mimeType)) throw new ApplicationError('VALIDATION_FAILED', 'Only PDF, TXT and Markdown documents are supported.');
    const page = (value:number|undefined, field:string) => {
      if (value === undefined) return undefined;
      if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new ApplicationError('VALIDATION_FAILED', `${field} must be a positive page number.`);
      return value;
    };
    const pageStart=page(raw.pageStart,'pageStart'); const pageEnd=page(raw.pageEnd,'pageEnd');
    if (pageStart!==undefined&&pageEnd!==undefined&&pageEnd<pageStart) throw new ApplicationError('VALIDATION_FAILED','pageEnd cannot precede pageStart.');
    const documentId = this.deps.ids.generate('knowledge_document');
    const text = cleanText(raw.text, 'text', 2_000_000);
    const count = chunkCount(text);
    if (count > 2_000) throw new ApplicationError('VALIDATION_FAILED', 'Document contains more than 2000 chunks.');
    const baseMetadata: Omit<KnowledgeDocumentMetadata, 'section'> = {
      workspaceId: context.workspaceId, subjectId: space.subjectId, grade: space.grade, umkId: space.umkId,
      documentId, documentType: raw.documentType, title: cleanText(raw.title, 'title', 500),
      sourceRevision: cleanText(raw.sourceRevision, 'sourceRevision', 200),
      ...(raw.chapter ? { chapter: cleanText(raw.chapter, 'chapter', 300) } : {}),
      ...(raw.topic ? { topic: cleanText(raw.topic, 'topic', 300) } : {}),
      ...(pageStart !== undefined ? { pageStart } : {}),
      ...(pageEnd !== undefined ? { pageEnd } : {})
    };
    const chunks = chunkKnowledgeDocument({ text, baseMetadata, chunkIds: Array.from({ length: count }, () => this.deps.ids.generate('knowledge_chunk')) })
      .map((chunk) => ({ ...chunk, knowledgeSpaceId: space.id }));
    const at = this.deps.clock.now().toISOString();
    return this.deps.repository.ingest(context, { document: {
      id: documentId, knowledgeSpaceId: space.id, workspaceId: context.workspaceId,
      documentType: raw.documentType, title: baseMetadata.title, mimeType: cleanText(raw.mimeType, 'mimeType', 200),
      sourceRevision: baseMetadata.sourceRevision, checksumSha256: cleanText(raw.checksumSha256, 'checksumSha256', 64),
      status: 'REVIEW', chunkCount: chunks.length, createdAt: at
    }, chunks });
  }
}

export class PublishKnowledgeDocument {
  constructor(private readonly deps: { repository: KnowledgeSpaceRepository; clock: Clock }) {}
  execute(context: RequestContext, knowledgeSpaceId: string, documentId: string): Promise<KnowledgeDocument> {
    return this.deps.repository.publishDocument(context, {
      knowledgeSpaceId: cleanText(knowledgeSpaceId, 'knowledgeSpaceId', 200),
      documentId: cleanText(documentId, 'documentId', 200), at: this.deps.clock.now().toISOString()
    });
  }
}

export class RetrieveKnowledge {
  constructor(private readonly repository: KnowledgeSpaceRepository) {}
  execute(context: RequestContext, input: { knowledgeSpaceId: string; query: string; documentTypes?: KnowledgeDocumentType[]; limit?: number }): Promise<KnowledgeRetrievalHit[]> {
    const limit = input.limit ?? 8;
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new ApplicationError('VALIDATION_FAILED', 'limit must be between 1 and 30.');
    if (input.documentTypes?.some((type) => !documentTypes.has(type))) throw new ApplicationError('VALIDATION_FAILED', 'Unsupported documentTypes filter.');
    const query = cleanText(input.query, 'query', 2_000);
    return this.repository.retrieve(context, {
      knowledgeSpaceId: cleanText(input.knowledgeSpaceId, 'knowledgeSpaceId', 200), query,
      queryEmbedding: knowledgeTextEmbedding(query), ...(input.documentTypes ? { documentTypes: input.documentTypes } : {}), limit
    });
  }
}

export class LinkCourseKnowledgeSpace {
  constructor(private readonly deps: { courses: CourseRepository; knowledgeSpaces: KnowledgeSpaceRepository }) {}

  async execute(context: RequestContext, input: { courseId:string; knowledgeSpaceId:string; expectedCourseVersion:number }) {
    if (!Number.isInteger(input.expectedCourseVersion) || input.expectedCourseVersion < 1) throw new ApplicationError('VALIDATION_FAILED', 'expectedCourseVersion must be positive.');
    const [course, space] = await Promise.all([
      this.deps.courses.getById(context, cleanText(input.courseId, 'courseId', 200)),
      this.deps.knowledgeSpaces.get(context, cleanText(input.knowledgeSpaceId, 'knowledgeSpaceId', 200))
    ]);
    if (!course || !space) throw new ApplicationError('NOT_FOUND', 'Course or knowledge space was not found.');
    if (space.status !== 'PUBLISHED') throw new ApplicationError('CONFLICT', 'Only a published knowledge space can ground a course.');
    const normalize = (value:string) => value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (course.grade !== space.grade || normalize(course.subject) !== normalize(space.subjectId)) {
      throw new ApplicationError('VALIDATION_FAILED', 'Knowledge space subject and grade must match the course.', { courseSubject:course.subject, courseGrade:course.grade, spaceSubject:space.subjectId, spaceGrade:space.grade });
    }
    return this.deps.courses.save(context, { ...course, knowledgeSpaceId:space.id }, { expectedVersion:input.expectedCourseVersion });
  }
}
