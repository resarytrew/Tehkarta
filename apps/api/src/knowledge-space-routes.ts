import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ApplicationError,
  CreateKnowledgeSpace,
  IngestKnowledgeDocument,
  LinkCourseKnowledgeSpace,
  PublishKnowledgeDocument,
  RetrieveKnowledge,
  type KnowledgeDocumentType,
  type KnowledgeSpaceRepository,
  type CourseRepository
} from '@tehkarta/application';
import type { AuthorizationPolicy, Clock, IdGenerator, RequestContext } from '@tehkarta/ports';
import { requestContextFromPrincipal, requireCsrf, requireWorkspacePrincipal, type AuthRuntime } from './auth.js';
import { extractDocumentText, normalizedDocumentMimeType } from './document-extraction.js';

interface Dependencies { auth:AuthRuntime; repository:KnowledgeSpaceRepository; courses:CourseRepository; authorization:AuthorizationPolicy; clock:Clock; ids:IdGenerator }

function record(value:unknown):Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApplicationError('VALIDATION_FAILED', 'Request body must be an object.');
  return value as Record<string,unknown>;
}
function stringValue(value:unknown, field:string):string {
  if (typeof value !== 'string') throw new ApplicationError('VALIDATION_FAILED', `${field} must be a string.`);
  return value;
}
function integer(value:unknown, field:string):number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ApplicationError('VALIDATION_FAILED', `${field} must be an integer.`);
  return value;
}
function documentType(value:unknown):KnowledgeDocumentType {
  if (value === 'WORKING_PROGRAM' || value === 'TEXTBOOK' || value === 'METHOD_GUIDE' || value === 'ATLAS' || value === 'WORKBOOK' || value === 'ASSESSMENT' || value === 'LOCAL_MATERIAL') return value;
  throw new ApplicationError('VALIDATION_FAILED', 'Unsupported documentType.');
}
async function permit(dependencies:Dependencies, context:RequestContext, action:'knowledge:read'|'knowledge:write') {
  const allowed = await dependencies.authorization.can(context, action, { type:'knowledge-space', workspaceId:context.workspaceId });
  if (!allowed) throw new ApplicationError('FORBIDDEN', `You do not have permission to ${action}.`);
}

export async function registerKnowledgeSpaceRoutes(app:FastifyInstance, dependencies:Dependencies):Promise<void> {
  const create = new CreateKnowledgeSpace({ repository:dependencies.repository, clock:dependencies.clock, ids:dependencies.ids });
  const ingest = new IngestKnowledgeDocument({ repository:dependencies.repository, clock:dependencies.clock, ids:dependencies.ids });
  const publish = new PublishKnowledgeDocument({ repository:dependencies.repository, clock:dependencies.clock });
  const retrieve = new RetrieveKnowledge(dependencies.repository);
  const linkCourse = new LinkCourseKnowledgeSpace({ courses:dependencies.courses, knowledgeSpaces:dependencies.repository });

  app.get('/api/v1/admin/knowledge-spaces', async (request) => {
    const principal = await requireWorkspacePrincipal(request, dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:read');
    return { data:await dependencies.repository.list(context) };
  });
  app.post<{Body:unknown}>('/api/v1/admin/knowledge-spaces', async (request) => {
    await requireCsrf(request,dependencies.auth); const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:write'); const body=record(request.body);
    return { data:await create.execute(context,{ subjectId:stringValue(body.subjectId,'subjectId'), grade:integer(body.grade,'grade'), umkId:stringValue(body.umkId,'umkId') }) };
  });
  app.get<{Params:{spaceId:string}}>('/api/v1/admin/knowledge-spaces/:spaceId/documents', async (request) => {
    const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:read');
    return { data:await dependencies.repository.listDocuments(context,request.params.spaceId) };
  });
  app.post<{Params:{spaceId:string};Querystring:{documentType?:string;title?:string;sourceRevision?:string;chapter?:string;topic?:string;pageStart?:string;pageEnd?:string}}>('/api/v1/admin/knowledge-spaces/:spaceId/documents',{bodyLimit:10_485_760},async(request)=>{
    await requireCsrf(request,dependencies.auth); const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:write');
    const file=await request.file({limits:{files:1,fileSize:10_485_760}}); if(!file) throw new ApplicationError('VALIDATION_FAILED','Document file is required.');
    const bytes=new Uint8Array(await file.toBuffer()); const mimeType=normalizedDocumentMimeType(file.mimetype,file.filename); const extracted=await extractDocumentText(bytes,mimeType);
    const optionalPage=(value:string|undefined)=>value === undefined ? undefined : Number(value);
    return { data:await ingest.execute(context,{ knowledgeSpaceId:request.params.spaceId, documentType:documentType(request.query.documentType), title:request.query.title?.trim()||file.filename, mimeType, sourceRevision:request.query.sourceRevision?.trim()||'1', checksumSha256:createHash('sha256').update(bytes).digest('hex'), text:extracted.text, ...(request.query.chapter?{chapter:request.query.chapter}:{}), ...(request.query.topic?{topic:request.query.topic}:{}), ...(optionalPage(request.query.pageStart)!==undefined?{pageStart:optionalPage(request.query.pageStart)!}:{}), ...(optionalPage(request.query.pageEnd)!==undefined?{pageEnd:optionalPage(request.query.pageEnd)!}:{}), ...(extracted.pageCount!==undefined && request.query.pageEnd===undefined?{pageEnd:extracted.pageCount}:{}) }) };
  });
  app.post<{Params:{spaceId:string;documentId:string}}>('/api/v1/admin/knowledge-spaces/:spaceId/documents/:documentId/publish',async(request)=>{
    await requireCsrf(request,dependencies.auth); const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:write');
    return { data:await publish.execute(context,request.params.spaceId,request.params.documentId) };
  });
  app.post<{Params:{spaceId:string};Body:unknown}>('/api/v1/knowledge-spaces/:spaceId/retrieve',async(request)=>{
    const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:read'); const body=record(request.body);
    const rawTypes=body.documentTypes; if(rawTypes!==undefined && (!Array.isArray(rawTypes)||rawTypes.some((item)=>typeof item!=='string'))) throw new ApplicationError('VALIDATION_FAILED','documentTypes must be an array.');
    return { data:await retrieve.execute(context,{ knowledgeSpaceId:request.params.spaceId, query:stringValue(body.query,'query'), ...(rawTypes?{documentTypes:rawTypes.map(documentType)}:{}), ...(body.limit!==undefined?{limit:integer(body.limit,'limit')}:{}) }) };
  });
  app.post<{Params:{courseId:string};Body:unknown}>('/api/v1/courses/:courseId/knowledge-space',async(request)=>{
    await requireCsrf(request,dependencies.auth); const principal=await requireWorkspacePrincipal(request,dependencies.auth); const context=requestContextFromPrincipal(request,principal); await permit(dependencies,context,'knowledge:write'); const body=record(request.body);
    return { data:await linkCourse.execute(context,{ courseId:request.params.courseId, knowledgeSpaceId:stringValue(body.knowledgeSpaceId,'knowledgeSpaceId'), expectedCourseVersion:integer(body.expectedCourseVersion,'expectedCourseVersion') }) };
  });
}
