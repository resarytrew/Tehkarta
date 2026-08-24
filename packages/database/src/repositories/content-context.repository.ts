import type {
  ContentContextScope,
  ContentContextSource,
  ContentRelationType,
  ContentResourceType,
  CurriculumAllocationStage,
  CurriculumRequirementKind,
  LessonContentContext,
  LessonContentContextRepository,
  LessonCurriculumRequirement,
  LessonUmkEvidenceItem,
  SourceAccessLevel
} from '@tehkarta/application';
import type { ContentFreedom } from '@tehkarta/domain';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

interface LessonContextRow {
  lesson_id: string;
  course_id: string;
  content_freedom: ContentFreedom;
  curriculum_lesson_id: string | null;
  curriculum_section_id: string | null;
  curriculum_course_id: string | null;
  curriculum_pack_id: string;
  curriculum_pack_version: string;
  curriculum_pack_title: string;
  content_pack_id: string;
  content_pack_version: string;
  content_pack_title: string;
}

interface RequirementRow {
  id: string;
  code: string | null;
  kind: CurriculumRequirementKind;
  text_content: string;
  allocation_stage: CurriculumAllocationStage;
  allocation_scope: ContentContextScope;
  source_id: string | null;
  source_version: string | null;
  source_kind: string | null;
  source_title: string | null;
  rights_basis: string | null;
  access_level: SourceAccessLevel | null;
}

interface UmkRow {
  mapping_id: string;
  source_unit_id: string;
  relation_type: ContentRelationType;
  mapping_scope: ContentContextScope;
  resource_type: ContentResourceType;
  unit_type: string;
  unit_title: string | null;
  parent_title: string | null;
  page_start: number | null;
  page_end: number | null;
  text_content: string | null;
  has_text: boolean;
  content_hash: string | null;
  source_id: string;
  source_version: string;
  source_kind: string;
  source_title: string;
  rights_basis: string;
  access_level: SourceAccessLevel;
}

function sourceFromRequirement(row: RequirementRow): ContentContextSource | null {
  if (
    !row.source_id ||
    !row.source_version ||
    !row.source_kind ||
    !row.source_title ||
    !row.rights_basis ||
    !row.access_level
  ) {
    return null;
  }
  return {
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    sourceType: row.source_kind,
    title: row.source_title,
    rightsBasis: row.rights_basis,
    accessLevel: row.access_level
  };
}

function pages(pageStart: number | null, pageEnd: number | null): string | undefined {
  if (pageStart === null && pageEnd === null) return undefined;
  if (pageStart !== null && (pageEnd === null || pageEnd === pageStart)) return `с. ${pageStart}`;
  if (pageStart === null && pageEnd !== null) return `с. ${pageEnd}`;
  return `с. ${pageStart}–${pageEnd}`;
}

function mapRequirement(row: RequirementRow): LessonCurriculumRequirement {
  return {
    id: row.id,
    ...(row.code ? { code: row.code } : {}),
    kind: row.kind,
    text: row.text_content,
    allocationStage: row.allocation_stage,
    allocationScope: row.allocation_scope,
    source: sourceFromRequirement(row)
  };
}

function mapUmk(row: UmkRow): LessonUmkEvidenceItem {
  const source: ContentContextSource = {
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    sourceType: row.source_kind,
    title: row.source_title,
    rightsBasis: row.rights_basis,
    accessLevel: row.access_level,
    ...(row.parent_title ? { section: row.parent_title } : {}),
    ...(row.page_start !== null ? { pageStart: row.page_start } : {}),
    ...(row.page_end !== null ? { pageEnd: row.page_end } : {}),
    ...(row.content_hash ? { fragmentHash: row.content_hash } : {})
  };

  const pageLabel = pages(row.page_start, row.page_end);
  const title = row.unit_title?.trim() || row.parent_title?.trim() || row.unit_type;
  return {
    mappingId: row.mapping_id,
    sourceUnitId: row.source_unit_id,
    relationType: row.relation_type,
    mappingScope: row.mapping_scope,
    resourceType: row.resource_type,
    unitType: row.unit_type,
    title,
    ...(row.parent_title ? { sectionRef: row.parent_title } : {}),
    ...(pageLabel ? { pages: pageLabel } : {}),
    ...(row.text_content ? { text: row.text_content } : {}),
    textRestricted: row.has_text && row.access_level !== 'FULL',
    source
  };
}

export class PostgresLessonContentContextRepository implements LessonContentContextRepository {
  constructor(private readonly pool: Pool) {}

  async getForLesson(context: RequestContext, lessonId: string): Promise<LessonContentContext | null> {
    const base = await this.pool.query<LessonContextRow>(
      `SELECT
         l.id AS lesson_id,
         l.course_id,
         l.content_freedom,
         l.curriculum_lesson_id,
         cs.curriculum_section_id,
         c.curriculum_course_id,
         c.curriculum_pack_id,
         c.curriculum_pack_version,
         cp.title AS curriculum_pack_title,
         c.content_pack_id,
         c.content_pack_version,
         ctp.title AS content_pack_title
       FROM lessons l
       JOIN courses c
         ON c.id = l.course_id
        AND c.workspace_id = l.workspace_id
       JOIN course_sections cs
         ON cs.id = l.section_id
        AND cs.workspace_id = l.workspace_id
        AND cs.course_id = l.course_id
       JOIN curriculum_packs cp ON cp.id = c.curriculum_pack_id
       JOIN content_packs ctp ON ctp.id = c.content_pack_id
       WHERE l.id = $2
         AND l.workspace_id = $1
         AND l.archived_at IS NULL
         AND c.archived_at IS NULL`,
      [context.workspaceId, lessonId]
    );
    const row = base.rows[0];
    if (!row) return null;

    const requirements = await this.pool.query<RequirementRow>(
      `SELECT
         cr.id,
         cr.code,
         cr.kind,
         cr.text_content,
         cra.allocation_stage,
         CASE
           WHEN cra.curriculum_lesson_id IS NOT NULL THEN 'LESSON'
           WHEN cra.curriculum_section_id IS NOT NULL THEN 'SECTION'
           ELSE 'COURSE'
         END AS allocation_scope,
         sd.id AS source_id,
         sd.version AS source_version,
         sd.source_kind,
         sd.title AS source_title,
         sd.rights_basis,
         sd.access_level
       FROM curriculum_requirements cr
       JOIN curriculum_requirement_allocations cra ON cra.requirement_id = cr.id
       JOIN curriculum_packs cp ON cp.id = cr.curriculum_pack_id
       LEFT JOIN source_documents sd ON sd.id = cp.source_document_id
       WHERE cr.curriculum_pack_id = $1
         AND (
           cra.curriculum_lesson_id = $2
           OR cra.curriculum_section_id = $3
           OR cra.curriculum_course_id = $4
         )
       ORDER BY
         CASE
           WHEN cra.curriculum_lesson_id IS NOT NULL THEN 0
           WHEN cra.curriculum_section_id IS NOT NULL THEN 1
           ELSE 2
         END,
         CASE cr.kind
           WHEN 'CONTENT' THEN 0
           WHEN 'OUTCOME' THEN 1
           WHEN 'ASSESSMENT' THEN 2
           ELSE 3
         END,
         cr.id`,
      [
        row.curriculum_pack_id,
        row.curriculum_lesson_id,
        row.curriculum_section_id,
        row.curriculum_course_id
      ]
    );

    const umk = await this.pool.query<UmkRow>(
      `SELECT
         cm.id AS mapping_id,
         su.id AS source_unit_id,
         cm.relation_type,
         CASE
           WHEN cm.curriculum_lesson_id IS NOT NULL THEN 'LESSON'
           WHEN cm.curriculum_section_id IS NOT NULL THEN 'SECTION'
           ELSE 'COURSE'
         END AS mapping_scope,
         cps.resource_type,
         su.unit_type,
         su.title AS unit_title,
         parent.title AS parent_title,
         su.page_start,
         su.page_end,
         CASE WHEN sd.access_level = 'FULL' THEN su.text_content ELSE NULL END AS text_content,
         (su.text_content IS NOT NULL AND length(su.text_content) > 0) AS has_text,
         su.content_hash,
         sd.id AS source_id,
         sd.version AS source_version,
         sd.source_kind,
         sd.title AS source_title,
         sd.rights_basis,
         sd.access_level
       FROM content_mappings cm
       JOIN source_units su ON su.id = cm.source_unit_id
       JOIN source_documents sd
         ON sd.id = su.source_document_id
        AND sd.processing_status = 'READY'
       JOIN content_pack_sources cps
         ON cps.content_pack_id = cm.content_pack_id
        AND cps.source_document_id = sd.id
       LEFT JOIN source_units parent ON parent.id = su.parent_id
       WHERE cm.content_pack_id = $1
         AND cm.review_status = 'APPROVED'
         AND (
           cm.curriculum_lesson_id = $2
           OR cm.curriculum_section_id = $3
           OR cm.curriculum_course_id = $4
         )
       ORDER BY
         CASE
           WHEN cm.curriculum_lesson_id IS NOT NULL THEN 0
           WHEN cm.curriculum_section_id IS NOT NULL THEN 1
           ELSE 2
         END,
         cps.ordinal,
         su.ordinal,
         cm.id`,
      [row.content_pack_id, row.curriculum_lesson_id, row.curriculum_section_id, row.curriculum_course_id]
    );

    return {
      lessonId: row.lesson_id,
      courseId: row.course_id,
      contentMode: row.content_freedom,
      curriculumPack: {
        id: row.curriculum_pack_id,
        version: row.curriculum_pack_version,
        title: row.curriculum_pack_title
      },
      contentPack: {
        id: row.content_pack_id,
        version: row.content_pack_version,
        title: row.content_pack_title
      },
      curriculumRequirements: requirements.rows.map(mapRequirement),
      umkEvidence: umk.rows.map(mapUmk),
      aiSupplemental: []
    };
  }
}
