import type { Course } from '../../../entities/course/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { KnowledgeDocument, KnowledgeDocumentType, KnowledgeSpace } from '../model/types.js';

export async function listKnowledgeSpaces(api:ApiClient):Promise<KnowledgeSpace[]> { return (await api.request<{data:KnowledgeSpace[]}>('/api/v1/admin/knowledge-spaces')).data; }
export async function createKnowledgeSpace(api:ApiClient,input:{subjectId:string;grade:number;umkId:string}):Promise<KnowledgeSpace> { return (await api.request<{data:KnowledgeSpace}>('/api/v1/admin/knowledge-spaces',{method:'POST',body:JSON.stringify(input)},{csrf:true})).data; }
export async function listKnowledgeDocuments(api:ApiClient,spaceId:string):Promise<KnowledgeDocument[]> { return (await api.request<{data:KnowledgeDocument[]}>(`/api/v1/admin/knowledge-spaces/${encodeURIComponent(spaceId)}/documents`)).data; }
export async function uploadKnowledgeDocument(api:ApiClient,input:{spaceId:string;file:File;documentType:KnowledgeDocumentType;title:string;sourceRevision:string}):Promise<KnowledgeDocument> {
  const query=new URLSearchParams({documentType:input.documentType,title:input.title,sourceRevision:input.sourceRevision}); const body=new FormData(); body.append('file',input.file);
  return (await api.request<{data:KnowledgeDocument}>(`/api/v1/admin/knowledge-spaces/${encodeURIComponent(input.spaceId)}/documents?${query.toString()}`,{method:'POST',body},{csrf:true})).data;
}
export async function publishKnowledgeDocument(api:ApiClient,spaceId:string,documentId:string):Promise<KnowledgeDocument> { return (await api.request<{data:KnowledgeDocument}>(`/api/v1/admin/knowledge-spaces/${encodeURIComponent(spaceId)}/documents/${encodeURIComponent(documentId)}/publish`,{method:'POST'},{csrf:true})).data; }
export async function linkCourseKnowledgeSpace(api:ApiClient,course:Course,knowledgeSpaceId:string):Promise<Course> { return (await api.request<{data:Course}>(`/api/v1/courses/${encodeURIComponent(course.id)}/knowledge-space`,{method:'POST',body:JSON.stringify({knowledgeSpaceId,expectedCourseVersion:course.version})},{csrf:true})).data; }
