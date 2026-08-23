import type {
  LessonInvalidation,
  LessonInvalidationRepository
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

interface InvalidationRow {
  id: string;
  lesson_id: string;
  source_decision_id: string;
  source_revision: number;
  affected_semantic_key: string;
  status: LessonInvalidation['status'];
  created_at: Date;
  resolved_at: Date | null;
  resolution_note: string | null;
}

function rowToInvalidation(row: InvalidationRow): LessonInvalidation {
  const invalidation: LessonInvalidation = {
    id: row.id,
    lessonId: row.lesson_id,
    sourceDecisionId: row.source_decision_id,
    sourceRevision: row.source_revision,
    affectedSemanticKey: row.affected_semantic_key,
    status: row.status,
    createdAt: row.created_at.toISOString()
  };

  if (row.resolved_at) invalidation.resolvedAt = row.resolved_at.toISOString();
  if (row.resolution_note) invalidation.resolutionNote = row.resolution_note;
  return invalidation;
}

export class PostgresLessonInvalidationRepository implements LessonInvalidationRepository {
  constructor(private readonly pool: Pool) {}

  async markStale(
    context: RequestContext,
    input: {
      lessonId: string;
      sourceDecisionId: string;
      sourceRevision: number;
      affectedSemanticKeys: readonly string[];
    }
  ): Promise<void> {
    if (input.affectedSemanticKeys.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const lesson = await client.query(
        `SELECT 1 FROM lessons
         WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
         FOR SHARE`,
        [input.lessonId, context.workspaceId]
      );
      if (!lesson.rowCount) {
        throw new Error('Cannot create invalidations for a lesson outside the request workspace.');
      }

      for (const semanticKey of input.affectedSemanticKeys) {
        const id = `${input.sourceDecisionId}:r${input.sourceRevision}:${semanticKey}`;
        await client.query(
          `INSERT INTO lesson_invalidations (
             id, workspace_id, lesson_id, source_decision_id, source_revision,
             affected_semantic_key, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'STALE', now())
           ON CONFLICT (id) DO NOTHING`,
          [
            id,
            context.workspaceId,
            input.lessonId,
            input.sourceDecisionId,
            input.sourceRevision,
            semanticKey
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listOpen(context: RequestContext, lessonId: string): Promise<LessonInvalidation[]> {
    const result = await this.pool.query<InvalidationRow>(
      `SELECT id, lesson_id, source_decision_id, source_revision,
              affected_semantic_key, status, created_at, resolved_at, resolution_note
       FROM lesson_invalidations
       WHERE workspace_id = $1 AND lesson_id = $2 AND status = 'STALE'
       ORDER BY created_at DESC, affected_semantic_key`,
      [context.workspaceId, lessonId]
    );

    return result.rows.map(rowToInvalidation);
  }
}
