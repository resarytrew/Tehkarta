import type { ContentFreedom } from '@tehkarta/domain';
import type { RequestContext } from '@tehkarta/ports';
import { ApplicationError } from './index.js';

export type SourceAccessLevel = 'METADATA_ONLY' | 'PREVIEW' | 'FULL';
export type ContentContextScope = 'COURSE' | 'SECTION' | 'LESSON';
export type CurriculumAllocationStage = 'MANDATORY' | 'INTRODUCE' | 'DEVELOP' | 'APPLY' | 'ASSESS';
export type CurriculumRequirementKind = 'CONTENT' | 'OUTCOME' | 'ASSESSMENT' | 'HOURS';
export type ContentRelationType = 'PRIMARY' | 'SUPPORTING' | 'ASSESSMENT' | 'EXTENSION';
export type ContentResourceType =
  | 'TEXTBOOK'
  | 'METHOD_GUIDE'
  | 'ATLAS'
  | 'WORKBOOK'
  | 'ASSESSMENT'
  | 'DIGITAL'
  | 'OTHER';

export interface ContentContextSource {
  sourceId: string;
  sourceVersion: string;
  sourceType: string;
  title: string;
  rightsBasis: string;
  accessLevel: SourceAccessLevel;
  section?: string;
  pageStart?: number;
  pageEnd?: number;
  fragmentHash?: string;
}

export interface LessonCurriculumRequirement {
  id: string;
  code?: string;
  kind: CurriculumRequirementKind;
  text: string;
  allocationStage: CurriculumAllocationStage;
  allocationScope: ContentContextScope;
  source: ContentContextSource | null;
}

export interface LessonUmkEvidenceItem {
  mappingId: string;
  sourceUnitId: string;
  relationType: ContentRelationType;
  mappingScope: ContentContextScope;
  resourceType: ContentResourceType;
  unitType: string;
  title: string;
  sectionRef?: string;
  pages?: string;
  text?: string;
  textRestricted: boolean;
  source: ContentContextSource;
}

export interface LessonContentContext {
  lessonId: string;
  courseId: string;
  contentMode: ContentFreedom;
  curriculumPack: {
    id: string;
    version: string;
    title: string;
  };
  contentPack: {
    id: string;
    version: string;
    title: string;
  };
  curriculumRequirements: LessonCurriculumRequirement[];
  umkEvidence: LessonUmkEvidenceItem[];
  aiSupplemental: [];
}

export interface LessonContentContextRepository {
  getForLesson(context: RequestContext, lessonId: string): Promise<LessonContentContext | null>;
}

export class GetLessonContentContext {
  constructor(private readonly repository: LessonContentContextRepository) {}

  async execute(context: RequestContext, lessonId: string): Promise<LessonContentContext> {
    const contentContext = await this.repository.getForLesson(context, lessonId);
    if (!contentContext) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${lessonId} was not found.`);
    }
    return contentContext;
  }
}
