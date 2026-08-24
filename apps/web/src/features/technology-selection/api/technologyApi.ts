import type { GovernanceResponse } from '../../../entities/lesson/model.js';
import type { TechnologyOption } from '../../../entities/methodology/model.js';
import type { ApiClient } from '../../../shared/api/ApiClient.js';
import type { ApiData } from '../../../shared/api/contracts.js';

export async function listTechnologies(api:ApiClient,lessonId:string):Promise<TechnologyOption[]>{return (await api.request<ApiData<TechnologyOption[]>>(`/api/v1/lessons/${encodeURIComponent(lessonId)}/methodology/technologies`)).data;}
export function approveTechnology(api:ApiClient,input:{lessonId:string;technology:TechnologyOption;expectedLessonVersion:number;expectedFieldRevision?:number}):Promise<GovernanceResponse>{return api.request(`/api/v1/lessons/${encodeURIComponent(input.lessonId)}/methodology/technology`,{method:'POST',body:JSON.stringify({technologyId:input.technology.technologyId,packId:input.technology.packId,packVersion:input.technology.packVersion,expectedLessonVersion:input.expectedLessonVersion,...(input.expectedFieldRevision!==undefined?{expectedFieldRevision:input.expectedFieldRevision}:{})})},{csrf:true});}
