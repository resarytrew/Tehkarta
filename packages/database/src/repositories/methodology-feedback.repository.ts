import type { MethodologyFeedbackRepository } from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

export class PostgresMethodologyFeedbackRepository implements MethodologyFeedbackRepository {
  constructor(private readonly pool: Pool) {}

  async listRejectedIds(context: RequestContext, lessonId: string): Promise<string[]> {
    const result = await this.pool.query<{ recommendation_id: string }>(
      `SELECT recommendation_id
       FROM lesson_methodology_feedback
       WHERE workspace_id = $1 AND lesson_id = $2 AND status = 'REJECTED'
       ORDER BY created_at ASC`,
      [context.workspaceId, lessonId]
    );
    return result.rows.map((row) => row.recommendation_id);
  }

  async reject(
    context: RequestContext,
    input: {
      lessonId: string;
      recommendationId: string;
      packId: string;
      packVersion: string;
      actorUserId: string;
      at: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO lesson_methodology_feedback(
         workspace_id, lesson_id, recommendation_id, pack_id, pack_version,
         status, actor_user_id, created_at
       )
       SELECT $1, l.id, $3, $4, $5, 'REJECTED', $6, $7
       FROM lessons l
       WHERE l.id = $2 AND l.workspace_id = $1 AND l.archived_at IS NULL
       ON CONFLICT (workspace_id, lesson_id, recommendation_id) DO UPDATE SET
         status = 'REJECTED',
         actor_user_id = EXCLUDED.actor_user_id,
         pack_id = EXCLUDED.pack_id,
         pack_version = EXCLUDED.pack_version,
         created_at = EXCLUDED.created_at`,
      [
        context.workspaceId,
        input.lessonId,
        input.recommendationId,
        input.packId,
        input.packVersion,
        input.actorUserId,
        new Date(input.at)
      ]
    );
  }
}
