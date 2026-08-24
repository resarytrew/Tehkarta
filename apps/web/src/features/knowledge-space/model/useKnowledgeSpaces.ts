import { useCallback, useEffect, useState } from 'react';
import type { Course } from '../../../entities/course/model.js';
import { useApiClient } from '../../../shared/api/ApiProvider.js';
import { useApiErrorRecovery } from '../../../shared/errors/useApiErrorRecovery.js';
import { useNotifications } from '../../../shared/notifications/NotificationProvider.js';
import { createKnowledgeSpace, linkCourseKnowledgeSpace, listKnowledgeDocuments, listKnowledgeSpaces, publishKnowledgeDocument, uploadKnowledgeDocument } from '../api/knowledgeSpaceApi.js';
import type { KnowledgeDocument, KnowledgeDocumentType, KnowledgeSpace } from './types.js';

export function useKnowledgeSpaces(course:Course|null,onCourseLinked:()=>Promise<void>) {
  const api=useApiClient(); const recover=useApiErrorRecovery(); const notifications=useNotifications();
  const [spaces,setSpaces]=useState<KnowledgeSpace[]>([]); const [selectedId,setSelectedId]=useState<string|null>(null); const [documents,setDocuments]=useState<KnowledgeDocument[]>([]); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState<string|null>(null);
  const refresh=useCallback(async()=>{setLoading(true);try{const next=await listKnowledgeSpaces(api);setSpaces(next);setSelectedId((current)=>current&&next.some((item)=>item.id===current)?current:next[0]?.id??null);}catch(error){await recover(error);}finally{setLoading(false);}},[api,recover]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(!selectedId){setDocuments([]);return;}void listKnowledgeDocuments(api,selectedId).then(setDocuments).catch((error)=>recover(error));},[api,recover,selectedId]);
  const create=useCallback(async(input:{subjectId:string;grade:number;umkId:string})=>{setBusy('create');try{const created=await createKnowledgeSpace(api,input);setSpaces((current)=>[...current,created]);setSelectedId(created.id);notifications.success('Knowledge Space создан. Загрузите документы и опубликуйте их после проверки.');}catch(error){await recover(error);throw error;}finally{setBusy(null);}},[api,notifications,recover]);
  const upload=useCallback(async(input:{file:File;documentType:KnowledgeDocumentType;title:string;sourceRevision:string})=>{if(!selectedId)return;setBusy('upload');try{const document=await uploadKnowledgeDocument(api,{spaceId:selectedId,...input});setDocuments((current)=>[document,...current]);notifications.info('Документ разобран и проиндексирован. До публикации он не используется в ответах AI.');}catch(error){await recover(error);throw error;}finally{setBusy(null);}},[api,notifications,recover,selectedId]);
  const publish=useCallback(async(documentId:string)=>{if(!selectedId)return;setBusy(documentId);try{const document=await publishKnowledgeDocument(api,selectedId,documentId);setDocuments((current)=>current.map((item)=>item.id===document.id?document:item));setSpaces((current)=>current.map((item)=>item.id===selectedId?{...item,status:'PUBLISHED'}:item));notifications.success('Документ опубликован в Knowledge Space.');}catch(error){await recover(error);throw error;}finally{setBusy(null);}},[api,notifications,recover,selectedId]);
  const linkCourse=useCallback(async()=>{if(!course||!selectedId)return;setBusy('link');try{await linkCourseKnowledgeSpace(api,course,selectedId);await onCourseLinked();notifications.success('Курс привязан к опубликованному Knowledge Space.');}catch(error){await recover(error);throw error;}finally{setBusy(null);}},[api,course,notifications,onCourseLinked,recover,selectedId]);
  return {spaces,selectedId,setSelectedId,documents,loading,busy,create,upload,publish,linkCourse};
}
