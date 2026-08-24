import { createHash } from 'node:crypto';
import {
  ApplicationError,
  coursePlanningReadiness,
  type ApprovedCourseLessonContext,
  type CourseLessonProgression,
  type CoursePlan,
  type CoursePlanningRepository,
  type CoursePlanningSnapshot,
  type CourseSourceDocument,
  type CourseSourceFragment,
  type CourseSourceRole
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

interface PlanRow {
  id: string;
  workspace_id: string;
  course_id: string;
  revision: number;
  status: 'DRAFT' | 'APPROVED';
  goals: unknown;
  planned_outcomes: unknown;
  content_summary: string;
  approved_at: Date | null;
  approved_by: string | null;
  updated_at: Date;
}

interface ProgressionRow {
  lesson_id: string;
  position: number;
  topic: string;
  content_summary: string;
  concepts: unknown;
  dates: unknown;
  personalities: unknown;
  expected_outcomes: unknown;
  progress_status: 'PLANNED' | 'TAUGHT' | 'ASSESSED';
}

interface SourceRow {
  binding_id: string;
  document_id: string;
  title: string;
  source_role: CourseSourceRole;
  mime_type: string;
  byte_size: number;
  checksum_sha256: string;
  rights_basis: string;
  processing_status: 'READY' | 'FAILED';
  binding_status: 'DRAFT' | 'APPROVED';
  page_count: unknown;
  fragment_count: number;
  created_at: Date;
}

interface FragmentRow {
  source_id: string;
  source_title: string;
  source_role: CourseSourceRole;
  unit_id: string;
  ordinal: number;
  page_start: number | null;
  page_end: number | null;
  text_content: string;
  content_hash: string;
}

interface KnowledgeFragmentRow {
  source_id: string;
  source_title: string;
  source_role: CourseSourceRole;
  unit_id: string;
  ordinal: number;
  page_start: number | null;
  page_end: number | null;
  text_content: string;
  content_hash: string;
  knowledge_space_id: string;
  source_revision: string;
  umk_id: string;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApplicationError('VALIDATION_FAILED', `Stored ${field} is invalid.`);
  }
  return value as string[];
}

function optionalPageCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function progressionFromRow(row: ProgressionRow): CourseLessonProgression {
  return {
    lessonId: row.lesson_id,
    position: row.position,
    topic: row.topic,
    contentSummary: row.content_summary,
    concepts: stringArray(row.concepts, 'concepts'),
    dates: stringArray(row.dates, 'dates'),
    personalities: stringArray(row.personalities, 'personalities'),
    expectedOutcomes: stringArray(row.expected_outcomes, 'expectedOutcomes'),
    progressStatus: row.progress_status
  };
}

function sourceFromRow(row: SourceRow): CourseSourceDocument {
  const pageCount = optionalPageCount(row.page_count);
  return {
    bindingId: row.binding_id,
    documentId: row.document_id,
    title: row.title,
    sourceRole: row.source_role,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    checksumSha256: row.checksum_sha256,
    rightsBasis: row.rights_basis,
    processingStatus: row.processing_status,
    status: row.binding_status,
    ...(pageCount !== undefined ? { pageCount } : {}),
    fragmentCount: row.fragment_count,
    createdAt: row.created_at.toISOString()
  };
}

function splitIntoFragments(text: string, maxLength = 3_000): string[] {
  const normalized = text.replaceAll('\r\n', '\n').trim();
  const fragments: string[] = [];
  for (let offset = 0; offset < normalized.length; offset += maxLength) {
    fragments.push(normalized.slice(offset, offset + maxLength));
  }
  return fragments;
}

function sourceKind(role: CourseSourceRole): string {
  if (role === 'WORKING_PROGRAM') return 'CURRICULUM';
  if (role === 'TEXTBOOK') return 'TEXTBOOK';
  if (role === 'METHOD_GUIDE') return 'METHOD_GUIDE';
  if (role === 'ATLAS') return 'ATLAS';
  if (role === 'WORKBOOK') return 'WORKBOOK';
  if (role === 'ASSESSMENT') return 'ASSESSMENT';
  return 'EXTERNAL';
}

async function requireCourse(client: PoolClient, context: RequestContext, courseId: string): Promise<void> {
  const result = await client.query(
    'SELECT 1 FROM courses WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL',
    [courseId, context.workspaceId]
  );
  if (!result.rowCount) throw new ApplicationError('NOT_FOUND', `Course ${courseId} was not found.`);
}

export class PostgresCoursePlanningRepository implements CoursePlanningRepository {
  constructor(private readonly pool: Pool) {}

  private async readPlan(context: RequestContext, courseId: string): Promise<CoursePlan | null> {
    const planResult = await this.pool.query<PlanRow>(
      `SELECT id, workspace_id, course_id, revision, status, goals, planned_outcomes,
              content_summary, approved_at, approved_by, updated_at
       FROM course_plans
       WHERE workspace_id = $1 AND course_id = $2`,
      [context.workspaceId, courseId]
    );
    const row = planResult.rows[0];
    if (!row) return null;
    const lessons = await this.pool.query<ProgressionRow>(
      `SELECT lesson_id, position, topic, content_summary, concepts, dates, personalities,
              expected_outcomes, progress_status
       FROM course_lesson_progressions
       WHERE workspace_id = $1 AND course_plan_id = $2
       ORDER BY position`,
      [context.workspaceId, row.id]
    );
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      courseId: row.course_id,
      revision: row.revision,
      status: row.status,
      goals: stringArray(row.goals, 'goals'),
      plannedOutcomes: stringArray(row.planned_outcomes, 'plannedOutcomes'),
      contentSummary: row.content_summary,
      lessons: lessons.rows.map(progressionFromRow),
      ...(row.approved_at ? { approvedAt: row.approved_at.toISOString() } : {}),
      ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private async readSources(context: RequestContext, courseId: string): Promise<CourseSourceDocument[]> {
    const result = await this.pool.query<SourceRow>(
      `SELECT b.id AS binding_id, d.id AS document_id, d.title, b.source_role, d.mime_type,
              blob.byte_size, d.checksum_sha256, d.rights_basis, d.processing_status,
              b.status AS binding_status, d.metadata->'pageCount' AS page_count,
              count(u.id)::int AS fragment_count, b.created_at
       FROM course_source_bindings b
       JOIN source_documents d ON d.id = b.source_document_id
       JOIN source_document_blobs blob
         ON blob.source_document_id = d.id AND blob.owner_workspace_id = b.workspace_id
       LEFT JOIN source_units u ON u.source_document_id = d.id
       WHERE b.workspace_id = $1 AND b.course_id = $2 AND d.owner_workspace_id = $1
       GROUP BY b.id, d.id, d.title, b.source_role, d.mime_type, blob.byte_size,
                d.checksum_sha256, d.rights_basis, d.processing_status, b.status,
                d.metadata, b.created_at
       ORDER BY b.created_at DESC`,
      [context.workspaceId, courseId]
    );
    return result.rows.map(sourceFromRow);
  }

  async getSnapshot(context: RequestContext, courseId: string): Promise<CoursePlanningSnapshot> {
    const exists = await this.pool.query(
      'SELECT 1 FROM courses WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL',
      [courseId, context.workspaceId]
    );
    if (!exists.rowCount) throw new ApplicationError('NOT_FOUND', `Course ${courseId} was not found.`);
    const [plan, sources] = await Promise.all([
      this.readPlan(context, courseId),
      this.readSources(context, courseId)
    ]);
    const base = { plan, sources };
    return { ...base, readiness: coursePlanningReadiness(base) };
  }

  async saveDraft(
    context: RequestContext,
    input: {
      courseId: string;
      planId: string;
      revisionId: string;
      draft: import('@tehkarta/application').CoursePlanDraftInput;
      at: string;
    }
  ): Promise<CoursePlanningSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await requireCourse(client, context, input.courseId);
      const lessonRows = await client.query<{ id: string; position: number }>(
        `SELECT id, position FROM lessons
         WHERE workspace_id = $1 AND course_id = $2 AND archived_at IS NULL
         ORDER BY position`,
        [context.workspaceId, input.courseId]
      );
      const actualLessonIds = new Set(lessonRows.rows.map((row) => row.id));
      if (
        input.draft.lessons.length !== actualLessonIds.size ||
        input.draft.lessons.some((lesson) => !actualLessonIds.has(lesson.lessonId))
      ) {
        throw new ApplicationError('VALIDATION_FAILED', 'Course plan must include every active lesson exactly once.');
      }

      const current = await client.query<{ id: string; revision: number }>(
        `SELECT id, revision FROM course_plans
         WHERE workspace_id = $1 AND course_id = $2 FOR UPDATE`,
        [context.workspaceId, input.courseId]
      );
      const currentRow = current.rows[0];
      if ((currentRow?.revision ?? 0) !== input.draft.expectedRevision) {
        throw new ApplicationError('STALE_VERSION', 'Course plan was modified by another request.');
      }
      const planId = currentRow?.id ?? input.planId;
      const nextRevision = (currentRow?.revision ?? 0) + 1;
      if (currentRow) {
        await client.query(
          `UPDATE course_plans
           SET revision = $1, status = 'DRAFT', goals = $2::jsonb,
               planned_outcomes = $3::jsonb, content_summary = $4,
               updated_by = $5, approved_by = NULL, approved_at = NULL, updated_at = $6
           WHERE id = $7 AND workspace_id = $8`,
          [nextRevision, JSON.stringify(input.draft.goals), JSON.stringify(input.draft.plannedOutcomes), input.draft.contentSummary, context.actorUserId, input.at, planId, context.workspaceId]
        );
      } else {
        await client.query(
          `INSERT INTO course_plans(
             id, workspace_id, course_id, revision, status, goals, planned_outcomes,
             content_summary, created_by, updated_by, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'DRAFT',$5::jsonb,$6::jsonb,$7,$8,$8,$9,$9)`,
          [planId, context.workspaceId, input.courseId, nextRevision, JSON.stringify(input.draft.goals), JSON.stringify(input.draft.plannedOutcomes), input.draft.contentSummary, context.actorUserId, input.at]
        );
      }

      for (const lesson of input.draft.lessons) {
        await client.query(
          `INSERT INTO course_lesson_progressions(
             id, workspace_id, course_plan_id, lesson_id, position, topic, content_summary,
             concepts, dates, personalities, expected_outcomes, progress_status, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
           ON CONFLICT (course_plan_id, lesson_id) DO UPDATE SET
             position = EXCLUDED.position, topic = EXCLUDED.topic,
             content_summary = EXCLUDED.content_summary, concepts = EXCLUDED.concepts,
             dates = EXCLUDED.dates, personalities = EXCLUDED.personalities,
             expected_outcomes = EXCLUDED.expected_outcomes,
             progress_status = EXCLUDED.progress_status, updated_at = EXCLUDED.updated_at
           WHERE course_lesson_progressions.workspace_id = EXCLUDED.workspace_id`,
          [`progression_${planId}_${lesson.lessonId}`, context.workspaceId, planId, lesson.lessonId, lesson.position, lesson.topic, lesson.contentSummary, JSON.stringify(lesson.concepts), JSON.stringify(lesson.dates), JSON.stringify(lesson.personalities), JSON.stringify(lesson.expectedOutcomes), lesson.progressStatus, input.at]
        );
      }

      await client.query(
        `INSERT INTO course_plan_revisions(
           id, workspace_id, course_plan_id, revision, status, payload_json,
           actor_user_id, occurred_at
         ) VALUES ($1,$2,$3,$4,'DRAFT',$5::jsonb,$6,$7)`,
        [input.revisionId, context.workspaceId, planId, nextRevision, JSON.stringify({ goals: input.draft.goals, plannedOutcomes: input.draft.plannedOutcomes, contentSummary: input.draft.contentSummary, lessons: input.draft.lessons }), context.actorUserId, input.at]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getSnapshot(context, input.courseId);
  }

  async approve(
    context: RequestContext,
    input: { courseId: string; expectedRevision: number; revisionId: string; at: string }
  ): Promise<CoursePlanningSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<PlanRow>(
        `SELECT id, workspace_id, course_id, revision, status, goals, planned_outcomes,
                content_summary, approved_at, approved_by, updated_at
         FROM course_plans WHERE workspace_id = $1 AND course_id = $2 FOR UPDATE`,
        [context.workspaceId, input.courseId]
      );
      const row = current.rows[0];
      if (!row) throw new ApplicationError('NOT_FOUND', 'Course plan was not found.');
      if (row.revision !== input.expectedRevision) {
        throw new ApplicationError('STALE_VERSION', 'Course plan was modified by another request.');
      }
      const nextRevision = row.revision + 1;
      await client.query(
        `UPDATE course_plans
         SET revision = $1, status = 'APPROVED', approved_by = $2, approved_at = $3,
             updated_by = $2, updated_at = $3
         WHERE id = $4 AND workspace_id = $5`,
        [nextRevision, context.actorUserId, input.at, row.id, context.workspaceId]
      );
      const lessons = await client.query<ProgressionRow>(
        `SELECT lesson_id, position, topic, content_summary, concepts, dates, personalities,
                expected_outcomes, progress_status
         FROM course_lesson_progressions
         WHERE workspace_id = $1 AND course_plan_id = $2 ORDER BY position`,
        [context.workspaceId, row.id]
      );
      await client.query(
        `INSERT INTO course_plan_revisions(
           id, workspace_id, course_plan_id, revision, status, payload_json,
           actor_user_id, occurred_at
         ) VALUES ($1,$2,$3,$4,'APPROVED',$5::jsonb,$6,$7)`,
        [input.revisionId, context.workspaceId, row.id, nextRevision, JSON.stringify({ goals: stringArray(row.goals, 'goals'), plannedOutcomes: stringArray(row.planned_outcomes, 'plannedOutcomes'), contentSummary: row.content_summary, lessons: lessons.rows.map(progressionFromRow) }), context.actorUserId, input.at]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getSnapshot(context, input.courseId);
  }

  async addSource(
    context: RequestContext,
    input: import('@tehkarta/application').CourseSourceUploadInput & {
      courseId: string;
      documentId: string;
      bindingId: string;
      sourceUnitIds: string[];
      at: string;
    }
  ): Promise<CoursePlanningSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await requireCourse(client, context, input.courseId);
      const fragments = splitIntoFragments(input.extractedText);
      if (fragments.length !== input.sourceUnitIds.length) {
        throw new ApplicationError('VALIDATION_FAILED', 'Source fragment allocation is inconsistent.');
      }
      await client.query(
        `INSERT INTO source_documents(
           id, owner_workspace_id, source_kind, title, version, mime_type,
           checksum_sha256, rights_basis, processing_status, access_level,
           metadata, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'READY','FULL',$9::jsonb,$10,$10)`,
        [input.documentId, context.workspaceId, sourceKind(input.sourceRole), input.title, `upload-${input.documentId}`, input.mimeType, input.checksumSha256, input.rightsBasis, JSON.stringify({ originalUpload: true, ...(input.pageCount !== undefined ? { pageCount: input.pageCount } : {}) }), input.at]
      );
      await client.query(
        `INSERT INTO source_document_blobs(source_document_id, owner_workspace_id, byte_size, content, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.documentId, context.workspaceId, input.bytes.byteLength, Buffer.from(input.bytes), input.at]
      );
      for (const [index, text] of fragments.entries()) {
        await client.query(
          `INSERT INTO source_units(
             id, source_document_id, unit_type, ordinal, title, text_content,
             content_hash, metadata, created_at
           ) VALUES ($1,$2,'FRAGMENT',$3,$4,$5,$6,'{}'::jsonb,$7)`,
          [input.sourceUnitIds[index], input.documentId, index + 1, `${input.title} · фрагмент ${index + 1}`, text, createHash('sha256').update(text).digest('hex'), input.at]
        );
      }
      await client.query(
        `INSERT INTO course_source_bindings(
           id, workspace_id, course_id, source_document_id, source_role, status,
           created_by, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$7)`,
        [input.bindingId, context.workspaceId, input.courseId, input.documentId, input.sourceRole, context.actorUserId, input.at]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getSnapshot(context, input.courseId);
  }

  async approveSource(
    context: RequestContext,
    input: { courseId: string; bindingId: string; at: string }
  ): Promise<CoursePlanningSnapshot> {
    const result = await this.pool.query(
      `UPDATE course_source_bindings
       SET status = 'APPROVED', approved_by = $1, approved_at = $2, updated_at = $2
       WHERE id = $3 AND workspace_id = $4 AND course_id = $5
       RETURNING id`,
      [context.actorUserId, input.at, input.bindingId, context.workspaceId, input.courseId]
    );
    if (!result.rowCount) throw new ApplicationError('NOT_FOUND', 'Course source binding was not found.');
    return this.getSnapshot(context, input.courseId);
  }

  async getApprovedLessonContext(
    context: RequestContext,
    courseId: string,
    lessonId: string
  ): Promise<ApprovedCourseLessonContext | null> {
    const plan = await this.readPlan(context, courseId);
    if (!plan || plan.status !== 'APPROVED') return null;
    const current = plan.lessons.find((lesson) => lesson.lessonId === lessonId);
    if (!current) return null;
    const [fragmentResult, knowledgeResult] = await Promise.all([this.pool.query<FragmentRow>(
      `SELECT d.id AS source_id, d.title AS source_title, b.source_role,
              u.id AS unit_id, u.ordinal, u.page_start, u.page_end,
              left(u.text_content, 1600) AS text_content, u.content_hash
       FROM course_source_bindings b
       JOIN source_documents d
         ON d.id = b.source_document_id
        AND d.owner_workspace_id = b.workspace_id
        AND d.processing_status = 'READY'
        AND d.access_level = 'FULL'
       JOIN source_units u ON u.source_document_id = d.id AND u.text_content IS NOT NULL
       WHERE b.workspace_id = $1 AND b.course_id = $2 AND b.status = 'APPROVED'
       ORDER BY CASE b.source_role WHEN 'WORKING_PROGRAM' THEN 0 WHEN 'TEXTBOOK' THEN 1 ELSE 2 END,
                b.created_at, u.ordinal
       LIMIT 24`,
      [context.workspaceId, courseId]
    ), this.pool.query<KnowledgeFragmentRow>(
      `SELECT d.id AS source_id, d.title AS source_title,
              CASE d.document_type
                WHEN 'WORKING_PROGRAM' THEN 'WORKING_PROGRAM'
                WHEN 'TEXTBOOK' THEN 'TEXTBOOK'
                WHEN 'METHOD_GUIDE' THEN 'METHOD_GUIDE'
                WHEN 'ATLAS' THEN 'ATLAS'
                WHEN 'WORKBOOK' THEN 'WORKBOOK'
                WHEN 'ASSESSMENT' THEN 'ASSESSMENT'
                ELSE 'OTHER'
              END AS source_role,
              k.id AS unit_id, k.ordinal,
              CASE WHEN (k.metadata->>'pageStart') ~ '^[0-9]+$' THEN (k.metadata->>'pageStart')::int END AS page_start,
              CASE WHEN (k.metadata->>'pageEnd') ~ '^[0-9]+$' THEN (k.metadata->>'pageEnd')::int END AS page_end,
              left(k.text_content,1600) AS text_content, md5(k.text_content) AS content_hash,
              ks.id AS knowledge_space_id, d.source_revision, ks.umk_id
       FROM courses c
       JOIN knowledge_spaces ks ON ks.id=c.knowledge_space_id AND ks.workspace_id=c.workspace_id AND ks.status='PUBLISHED'
       JOIN knowledge_documents d ON d.knowledge_space_id=ks.id AND d.workspace_id=ks.workspace_id AND d.status='PUBLISHED'
       JOIN knowledge_chunks k ON k.document_id=d.id AND k.knowledge_space_id=ks.id AND k.workspace_id=ks.workspace_id
       WHERE c.id=$1 AND c.workspace_id=$2 AND c.archived_at IS NULL
       ORDER BY ts_rank_cd(k.search_vector,websearch_to_tsquery('simple',$3)) DESC,
                CASE d.document_type WHEN 'WORKING_PROGRAM' THEN 0 WHEN 'TEXTBOOK' THEN 1 ELSE 2 END,
                d.id,k.ordinal
       LIMIT 16`,
      [courseId,context.workspaceId,[current.topic,...current.concepts].join(' ')]
    )]);
    const allRows: Array<FragmentRow | KnowledgeFragmentRow> = [...fragmentResult.rows, ...knowledgeResult.rows];
    const sourceFragments: CourseSourceFragment[] = allRows.map((row) => ({
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      sourceRole: row.source_role,
      unitId: row.unit_id,
      ordinal: row.ordinal,
      ...(row.page_start !== null ? { pageStart: row.page_start } : {}),
      ...(row.page_end !== null ? { pageEnd: row.page_end } : {}),
      text: row.text_content,
      contentHash: row.content_hash,
      ...('knowledge_space_id' in row ? { knowledgeProvenance:{ knowledgeSpaceId:row.knowledge_space_id, chunkId:row.unit_id, sourceRevision:row.source_revision, umkId:row.umk_id } } : {})
    }));
    return {
      courseId,
      ...(knowledgeResult.rows[0]?.knowledge_space_id ? { knowledgeSpaceId:knowledgeResult.rows[0].knowledge_space_id } : {}),
      planRevision: plan.revision,
      contextRevision: `${plan.revision}-${createHash('sha256')
        .update(sourceFragments.map((fragment) => `${fragment.sourceId}:${fragment.contentHash}`).join('|'))
        .digest('hex')
        .slice(0, 12)}`,
      courseGoals: plan.goals,
      plannedOutcomes: plan.plannedOutcomes,
      contentSummary: plan.contentSummary,
      previousLessons: plan.lessons.filter(
        (lesson) => lesson.position < current.position && lesson.progressStatus !== 'PLANNED'
      ),
      currentLesson: current,
      nextLessons: plan.lessons.filter((lesson) => lesson.position > current.position).slice(0, 3),
      sourceFragments
    };
  }
}
