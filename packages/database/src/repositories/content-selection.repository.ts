import {
  ApplicationError,
  type LessonContentSelection,
  type LessonContentSelectionRepository
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

interface SelectionRow {
  id: string;
  workspace_id: string;
  lesson_id: string;
  source_kind: 'UMK';
  source_ref_id: string;
  decision: 'INCLUDED' | 'EXCLUDED';
  revision: number;
  content_pack_id: string;
  content_pack_version: string;
  source_document_id: string;
  source_document_version: string;
  source_unit_id: string;
  title_snapshot: string;
  content_hash: string | null;
  actor_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapSelection(row: SelectionRow): LessonContentSelection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    lessonId: row.lesson_id,
    sourceKind: row.source_kind,
    sourceRefId: row.source_ref_id,
    decision: row.decision,
    revision: row.revision,
    contentPackId: row.content_pack_id,
    contentPackVersion: row.content_pack_version,
    sourceDocumentId: row.source_document_id,
    sourceDocumentVersion: row.source_document_version,
    sourceUnitId: row.source_unit_id,
    titleSnapshot: row.title_snapshot,
    ...(row.content_hash ? { contentHash: row.content_hash } : {}),
    actorUserId: row.actor_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function lockedLessonVersion(
  client: PoolClient,
  context: RequestContext,
  lessonId: string
): Promise<number> {
  const result = await client.query<{ version: number }>(
    `SELECT version
     FROM lessons
     WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
     FOR UPDATE`,
    [lessonId, context.workspaceId]
  );
  const version = result.rows[0]?.version;
  if (version === undefined) {
    throw new ApplicationError('NOT_FOUND', `Lesson ${lessonId} was not found.`);
  }
  return version;
}

export class PostgresLessonContentSelectionRepository
  implements LessonContentSelectionRepository
{
  constructor(private readonly pool: Pool) {}

  async setApprovedUmkDecision(
    context: RequestContext,
    input: Parameters<LessonContentSelectionRepository['setApprovedUmkDecision']>[1]
  ): Promise<{
    selection: LessonContentSelection;
    lessonVersion: number;
    changed: boolean;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const currentLessonVersion = await lockedLessonVersion(client, context, input.lessonId);
      if (currentLessonVersion !== input.expectedLessonVersion) {
        throw new ApplicationError(
          'STALE_VERSION',
          `Lesson ${input.lessonId} was modified by another request.`,
          {
            expectedLessonVersion: input.expectedLessonVersion,
            actualLessonVersion: currentLessonVersion
          }
        );
      }

      const existingResult = await client.query<SelectionRow>(
        `SELECT *
         FROM lesson_content_selections
         WHERE workspace_id = $1
           AND lesson_id = $2
           AND source_kind = 'UMK'
           AND source_ref_id = $3
         FOR UPDATE`,
        [context.workspaceId, input.lessonId, input.evidence.mappingId]
      );
      const existing = existingResult.rows[0];

      if (existing?.decision === input.decision) {
        await client.query('COMMIT');
        return {
          selection: mapSelection(existing),
          lessonVersion: currentLessonVersion,
          changed: false
        };
      }

      const versionResult = await client.query<{ version: number }>(
        `UPDATE lessons
         SET version = version + 1, updated_at = now()
         WHERE id = $1 AND workspace_id = $2 AND version = $3
         RETURNING version`,
        [input.lessonId, context.workspaceId, currentLessonVersion]
      );
      const lessonVersion = versionResult.rows[0]?.version;
      if (lessonVersion === undefined) {
        throw new ApplicationError(
          'STALE_VERSION',
          `Lesson ${input.lessonId} was modified by another request.`
        );
      }

      const revision = existing ? existing.revision + 1 : 1;
      const selectionResult = await client.query<SelectionRow>(
        `INSERT INTO lesson_content_selections(
           id, workspace_id, lesson_id, source_kind, source_ref_id, decision, revision,
           content_pack_id, content_pack_version, source_document_id, source_document_version,
           source_unit_id, title_snapshot, content_hash, actor_user_id, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'UMK', $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
         )
         ON CONFLICT (workspace_id, lesson_id, source_kind, source_ref_id) DO UPDATE SET
           decision = EXCLUDED.decision,
           revision = EXCLUDED.revision,
           content_pack_id = EXCLUDED.content_pack_id,
           content_pack_version = EXCLUDED.content_pack_version,
           source_document_id = EXCLUDED.source_document_id,
           source_document_version = EXCLUDED.source_document_version,
           source_unit_id = EXCLUDED.source_unit_id,
           title_snapshot = EXCLUDED.title_snapshot,
           content_hash = EXCLUDED.content_hash,
           actor_user_id = EXCLUDED.actor_user_id,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          existing?.id ?? input.selectionId,
          context.workspaceId,
          input.lessonId,
          input.evidence.mappingId,
          input.decision,
          revision,
          input.contentPackId,
          input.contentPackVersion,
          input.evidence.source.sourceId,
          input.evidence.source.sourceVersion,
          input.evidence.sourceUnitId,
          input.evidence.title,
          input.evidence.source.fragmentHash ?? null,
          input.actorUserId,
          new Date(input.at)
        ]
      );

      const row = selectionResult.rows[0];
      if (!row) {
        throw new Error('Content selection upsert returned no row.');
      }

      await client.query('COMMIT');
      return {
        selection: mapSelection(row),
        lessonVersion,
        changed: true
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
