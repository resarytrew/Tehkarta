import type { ContentFreedom } from '@tehkarta/domain';
import type { GovernanceResponse } from '../lesson/model.js';

export type SourceAccessLevel = 'METADATA_ONLY' | 'PREVIEW' | 'FULL';
export type ContentContextScope = 'COURSE' | 'SECTION' | 'LESSON';
export type ContentSelectionState = 'UNDECIDED' | 'INCLUDED' | 'EXCLUDED';
export type ContentSelectionDecision = 'INCLUDED' | 'EXCLUDED';

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
  kind: 'CONTENT' | 'OUTCOME' | 'ASSESSMENT' | 'HOURS';
  text: string;
  allocationStage: 'MANDATORY' | 'INTRODUCE' | 'DEVELOP' | 'APPLY' | 'ASSESS';
  allocationScope: ContentContextScope;
  source: ContentContextSource | null;
}

export interface LessonUmkEvidenceItem {
  mappingId: string;
  sourceUnitId: string;
  relationType: 'PRIMARY' | 'SUPPORTING' | 'ASSESSMENT' | 'EXTENSION';
  mappingScope: ContentContextScope;
  resourceType: 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'WORKBOOK' | 'ASSESSMENT' | 'DIGITAL' | 'OTHER';
  unitType: string;
  title: string;
  sectionRef?: string;
  pages?: string;
  text?: string;
  textRestricted: boolean;
  source: ContentContextSource;
  selection: {
    state: ContentSelectionState;
    revision?: number;
    actorUserId?: string;
    updatedAt?: string;
  };
}

export interface LessonContentContext {
  lessonId: string;
  courseId: string;
  contentMode: ContentFreedom;
  curriculumPack: { id: string; version: string; title: string };
  contentPack: { id: string; version: string; title: string };
  curriculumRequirements: LessonCurriculumRequirement[];
  umkEvidence: LessonUmkEvidenceItem[];
  approvedContentSet: {
    mandatoryRequirementIds: string[];
    includedUmkMappingIds: string[];
    excludedUmkMappingIds: string[];
    undecidedUmkMappingIds: string[];
  };
  aiSupplemental: [];
}

export interface LessonContentSelection {
  id: string;
  workspaceId: string;
  lessonId: string;
  sourceKind: 'UMK';
  sourceRefId: string;
  decision: ContentSelectionDecision;
  revision: number;
  contentPackId: string;
  contentPackVersion: string;
  sourceDocumentId: string;
  sourceDocumentVersion: string;
  sourceUnitId: string;
  titleSnapshot: string;
  contentHash?: string;
  actorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetContentSelectionResponse extends GovernanceResponse {
  contentContext: LessonContentContext;
  selection: LessonContentSelection;
  changed: boolean;
}
