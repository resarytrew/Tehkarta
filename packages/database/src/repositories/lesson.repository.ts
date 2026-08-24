import type { LessonRepository, LessonSummary } from '@tehkarta/application';
import { ApplicationError } from '@tehkarta/application';
import type {
  DesignFreedom,
  GovernedField,
  Lesson,
  MethodSelection,
  OrganizationalFormSelection,
  PedagogicalProfile,
  PedagogicalTechnologySelection,
  RevisionMeta,
  ValueSource,
  ApprovalStatus,
  TechniqueSelection,
  PedagogicalStyle,
  CommunicationTone,
  PedagogicalFocus
} from '@tehkarta/domain';
import type { OptimisticWriteOptions, RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

interface LessonSummaryRow {
  id: string;
  workspace_id: string;
  course_id: string;
  section_id: string;
  version: number;
  position: number;
  title: string;
  duration_minutes: number;
  state: LessonSummary['state'];
}

interface LessonRow {
  id: string;
  workspace_id: string;
  course_id: string;
  section_id: string;
  version: number;
  position: number;
  title: string;
  duration_minutes: number;
  design_mode: DesignFreedom['mode'];
  content_freedom: DesignFreedom['contentFreedom'];
  method_freedom: DesignFreedom['methodFreedom'];
}

interface DecisionRow {
  id: string;
  semantic_key: string;
  item_key: string;
  ordinal: number;
  value_json: unknown;
  source: ValueSource;
  status: ApprovalStatus;
  revision: number;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  updated_at: Date;
}

interface DecisionProjection {
  semanticKey: string;
  ordinal: number;
  field: GovernedField<unknown>;
}

function toIso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function rowToField(row: DecisionRow): GovernedField<unknown> {
  const meta: RevisionMeta = {
    revision: row.revision,
    source: row.source,
    status: row.status,
    updatedAt: row.updated_at.toISOString()
  };

  if (row.updated_by) meta.updatedBy = row.updated_by;
  const approvedAt = toIso(row.approved_at);
  if (approvedAt) meta.approvedAt = approvedAt;
  if (row.approved_by) meta.approvedBy = row.approved_by;

  return { fieldId: row.id, value: row.value_json, meta };
}

function stringField(field: GovernedField<unknown> | undefined): GovernedField<string> | undefined {
  if (!field || typeof field.value !== 'string') return undefined;
  return field as GovernedField<string>;
}

function objectField<T>(field: GovernedField<unknown> | undefined): GovernedField<T> | undefined {
  if (!field || !field.value || typeof field.value !== 'object' || Array.isArray(field.value)) return undefined;
  return field as GovernedField<T>;
}

function enumField<T extends string>(field: GovernedField<unknown> | undefined, allowed: ReadonlySet<string>): GovernedField<T> | undefined {
  if (!field || typeof field.value !== 'string' || !allowed.has(field.value)) return undefined;
  return field as GovernedField<T>;
}

function listOfStrings(items: DecisionProjection[], semanticKey: string): GovernedField<string>[] {
  return items
    .filter((item) => item.semanticKey === semanticKey && typeof item.field.value === 'string')
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((item) => item.field as GovernedField<string>);
}

function listOfObjects<T>(items: DecisionProjection[], semanticKey: string): GovernedField<T>[] {
  return items
    .filter((item) => item.semanticKey === semanticKey && item.field.value !== null && typeof item.field.value === 'object' && !Array.isArray(item.field.value))
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((item) => item.field as GovernedField<T>);
}

function allGovernedFields(lesson: Lesson): Array<{
  semanticKey: string;
  itemKey: string;
  ordinal: number;
  field: GovernedField<unknown>;
}> {
  const result: Array<{
    semanticKey: string;
    itemKey: string;
    ordinal: number;
    field: GovernedField<unknown>;
  }> = [];

  const pushSingle = (semanticKey: string, field?: GovernedField<unknown>) => {
    if (field) result.push({ semanticKey, itemKey: 'single', ordinal: 0, field });
  };

  pushSingle('profile.creed', lesson.pedagogicalProfile.creed);
  pushSingle('profile.style', lesson.pedagogicalProfile.style);
  pushSingle('profile.communicationTone', lesson.pedagogicalProfile.communicationTone);
  pushSingle('profile.focus', lesson.pedagogicalProfile.focus);
  pushSingle('pedagogicalTechnology', lesson.pedagogicalTechnology);
  pushSingle('goal', lesson.goal);
  pushSingle('problemQuestion', lesson.problemQuestion);
  pushSingle('bigIdea', lesson.bigIdea);

  const pushList = (semanticKey: string, fields: GovernedField<unknown>[]) => {
    fields.forEach((field, ordinal) => {
      result.push({ semanticKey, itemKey: field.fieldId, ordinal, field });
    });
  };

  pushList('outcome', lesson.outcomes);
  pushList('method', lesson.selectedMethods);
  pushList('technique', lesson.selectedTechniques);
  pushList('form', lesson.selectedForms);
  pushList('content', lesson.contentItems);

  return result;
}

async function persistDecision(
  client: PoolClient,
  context: RequestContext,
  lessonId: string,
  input: ReturnType<typeof allGovernedFields>[number]
): Promise<void> {
  const existing = await client.query<{ revision: number }>(
    `SELECT revision FROM lesson_decisions
     WHERE workspace_id = $1 AND lesson_id = $2 AND id = $3
     FOR UPDATE`,
    [context.workspaceId, lessonId, input.field.fieldId]
  );

  const currentRevision = existing.rows[0]?.revision;
  if (currentRevision !== undefined && currentRevision >= input.field.meta.revision) {
    return;
  }

  const valueJson = JSON.stringify(input.field.value);
  const updatedAt = new Date(input.field.meta.updatedAt);

  await client.query(
    `INSERT INTO lesson_decisions (
       id, workspace_id, lesson_id, semantic_key, item_key, ordinal,
       value_json, source, status, revision, updated_by, approved_by,
       approved_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8, $9, $10, $11, $12,
       $13, $14, $14
     )
     ON CONFLICT (id) DO UPDATE SET
       semantic_key = EXCLUDED.semantic_key,
       item_key = EXCLUDED.item_key,
       ordinal = EXCLUDED.ordinal,
       value_json = EXCLUDED.value_json,
       source = EXCLUDED.source,
       status = EXCLUDED.status,
       revision = EXCLUDED.revision,
       updated_by = EXCLUDED.updated_by,
       approved_by = EXCLUDED.approved_by,
       approved_at = EXCLUDED.approved_at,
       updated_at = EXCLUDED.updated_at`,
    [
      input.field.fieldId,
      context.workspaceId,
      lessonId,
      input.semanticKey,
      input.itemKey,
      input.ordinal,
      valueJson,
      input.field.meta.source,
      input.field.meta.status,
      input.field.meta.revision,
      input.field.meta.updatedBy ?? null,
      input.field.meta.approvedBy ?? null,
      input.field.meta.approvedAt ? new Date(input.field.meta.approvedAt) : null,
      updatedAt
    ]
  );

  await client.query(
    `INSERT INTO lesson_decision_revisions (
       id, workspace_id, decision_id, lesson_id, revision, value_json,
       source, status, actor_user_id, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
     ON CONFLICT (decision_id, revision) DO NOTHING`,
    [
      `${input.field.fieldId}:r${input.field.meta.revision}`,
      context.workspaceId,
      input.field.fieldId,
      lessonId,
      input.field.meta.revision,
      valueJson,
      input.field.meta.source,
      input.field.meta.status,
      input.field.meta.updatedBy ?? context.actorUserId,
      updatedAt
    ]
  );
}

export class PostgresLessonRepository implements LessonRepository {
  constructor(private readonly pool: Pool) {}

  async listSummariesByCourse(
    context: RequestContext,
    courseId: string
  ): Promise<LessonSummary[]> {
    const result = await this.pool.query<LessonSummaryRow>(
      `SELECT id, workspace_id, course_id, section_id, version, position,
              title, duration_minutes, state
       FROM lessons
       WHERE course_id = $1 AND workspace_id = $2 AND archived_at IS NULL
       ORDER BY section_id, position`,
      [courseId, context.workspaceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      courseId: row.course_id,
      sectionId: row.section_id,
      version: row.version,
      order: row.position,
      title: row.title,
      durationMinutes: row.duration_minutes,
      state: row.state
    }));
  }

  async getById(context: RequestContext, lessonId: string): Promise<Lesson | null> {
    const lessonResult = await this.pool.query<LessonRow>(
      `SELECT id, workspace_id, course_id, section_id, version, position, title,
              duration_minutes, design_mode, content_freedom, method_freedom
       FROM lessons
       WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
      [lessonId, context.workspaceId]
    );

    const row = lessonResult.rows[0];
    if (!row) return null;

    const decisionResult = await this.pool.query<DecisionRow>(
      `SELECT id, semantic_key, item_key, ordinal, value_json, source, status,
              revision, updated_by, approved_by, approved_at, updated_at
       FROM lesson_decisions
       WHERE lesson_id = $1 AND workspace_id = $2
       ORDER BY semantic_key, ordinal`,
      [lessonId, context.workspaceId]
    );

    const projected: DecisionProjection[] = decisionResult.rows.map((decision) => ({
      semanticKey: decision.semantic_key,
      ordinal: decision.ordinal,
      field: rowToField(decision)
    }));

    const single = (key: string) =>
      stringField(projected.find((item) => item.semanticKey === key)?.field);

    const pedagogicalProfile: PedagogicalProfile = {};
    const creed = single('profile.creed');
    const style = enumField<PedagogicalStyle>(projected.find((item) => item.semanticKey === 'profile.style')?.field, new Set(['CLASSICAL','CONSTRUCTIVIST','HUMANISTIC','GAME_BASED']));
    const communicationTone = enumField<CommunicationTone>(projected.find((item) => item.semanticKey === 'profile.communicationTone')?.field, new Set(['ACADEMIC','SUPPORTIVE','DIRECT','CREATIVE']));
    const focus = enumField<PedagogicalFocus>(projected.find((item) => item.semanticKey === 'profile.focus')?.field, new Set(['ENGAGEMENT','DEPTH','META_SKILLS','PRACTICAL_APPLICATION']));
    if (creed) pedagogicalProfile.creed = creed;
    if (style) pedagogicalProfile.style = style;
    if (communicationTone) pedagogicalProfile.communicationTone = communicationTone;
    if (focus) pedagogicalProfile.focus = focus;
    const pedagogicalTechnology = objectField<PedagogicalTechnologySelection>(projected.find((item) => item.semanticKey === 'pedagogicalTechnology')?.field);

    const lesson: Lesson = {
      id: row.id,
      workspaceId: row.workspace_id,
      version: row.version,
      courseId: row.course_id,
      sectionId: row.section_id,
      order: row.position,
      title: row.title,
      durationMinutes: row.duration_minutes,
      pedagogicalProfile,
      designFreedom: {
        mode: row.design_mode,
        contentFreedom: row.content_freedom,
        methodFreedom: row.method_freedom
      },
      outcomes: listOfStrings(projected, 'outcome'),
      selectedMethods: listOfObjects<MethodSelection>(projected, 'method'),
      selectedTechniques: listOfObjects<TechniqueSelection>(projected, 'technique'),
      selectedForms: listOfObjects<OrganizationalFormSelection>(projected, 'form'),
      contentItems: listOfStrings(projected, 'content')
    };

    const goal = single('goal');
    const problemQuestion = single('problemQuestion');
    const bigIdea = single('bigIdea');
    if (goal) lesson.goal = goal;
    if (problemQuestion) lesson.problemQuestion = problemQuestion;
    if (bigIdea) lesson.bigIdea = bigIdea;
    if (pedagogicalTechnology) lesson.pedagogicalTechnology = pedagogicalTechnology;

    return lesson;
  }

  async save(
    context: RequestContext,
    lesson: Lesson,
    options: OptimisticWriteOptions
  ): Promise<Lesson> {
    if (lesson.workspaceId !== context.workspaceId) {
      throw new ApplicationError('FORBIDDEN', 'Lesson belongs to another workspace.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await client.query<{ version: number }>(
        `UPDATE lessons
         SET title = $1,
             duration_minutes = $2,
             design_mode = $3,
             content_freedom = $4,
             method_freedom = $5,
             version = version + 1,
             updated_at = now()
         WHERE id = $6 AND workspace_id = $7 AND version = $8
         RETURNING version`,
        [
          lesson.title,
          lesson.durationMinutes,
          lesson.designFreedom.mode,
          lesson.designFreedom.contentFreedom,
          lesson.designFreedom.methodFreedom,
          lesson.id,
          context.workspaceId,
          options.expectedVersion
        ]
      );

      const nextVersion = updated.rows[0]?.version;
      if (nextVersion === undefined) {
        const exists = await client.query(
          'SELECT 1 FROM lessons WHERE id = $1 AND workspace_id = $2',
          [lesson.id, context.workspaceId]
        );
        throw new ApplicationError(
          exists.rowCount ? 'STALE_VERSION' : 'NOT_FOUND',
          exists.rowCount
            ? `Lesson ${lesson.id} was modified by another request.`
            : `Lesson ${lesson.id} was not found.`
        );
      }

      for (const decision of allGovernedFields(lesson)) {
        await persistDecision(client, context, lesson.id, decision);
      }

      await client.query('COMMIT');
      return { ...lesson, version: nextVersion };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
