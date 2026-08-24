import {
  ApplicationError,
  type LessonDesignArtifact,
  type LessonDesignArtifactKind,
  type LessonDesignArtifactRepository
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

interface ArtifactRow {
  id: string;
  workspace_id: string;
  lesson_id: string;
  kind: LessonDesignArtifactKind;
  revision: number;
  payload_json: Readonly<Record<string, unknown>>;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

function mapArtifact(row: ArtifactRow): LessonDesignArtifact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    lessonId: row.lesson_id,
    kind: row.kind,
    revision: row.revision,
    payload: row.payload_json,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PostgresLessonDesignArtifactRepository implements LessonDesignArtifactRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: RequestContext, lessonId: string): Promise<LessonDesignArtifact[]> {
    const result = await this.pool.query<ArtifactRow>(
      `SELECT id, workspace_id, lesson_id, kind, revision, payload_json,
              updated_by, created_at, updated_at
       FROM lesson_design_artifacts
       WHERE workspace_id = $1 AND lesson_id = $2
       ORDER BY kind`,
      [context.workspaceId, lessonId]
    );
    return result.rows.map(mapArtifact);
  }

  async save(
    context: RequestContext,
    input: {
      id: string;
      lessonId: string;
      kind: LessonDesignArtifactKind;
      expectedRevision: number;
      payload: Readonly<Record<string, unknown>>;
      actorUserId: string;
      at: string;
    }
  ): Promise<LessonDesignArtifact> {
    const params = [
      input.id,
      context.workspaceId,
      input.lessonId,
      input.kind,
      input.expectedRevision,
      JSON.stringify(input.payload),
      input.actorUserId,
      new Date(input.at)
    ];
    const result = input.expectedRevision === 0
      ? await this.pool.query<ArtifactRow>(
          `INSERT INTO lesson_design_artifacts(
             id, workspace_id, lesson_id, kind, revision, payload_json,
             updated_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 1, $6::jsonb, $7, $8::timestamptz, $8::timestamptz)
           ON CONFLICT (workspace_id, lesson_id, kind) DO NOTHING
           RETURNING id, workspace_id, lesson_id, kind, revision, payload_json,
                     updated_by, created_at, updated_at`,
          params
        )
      : await this.pool.query<ArtifactRow>(
          `UPDATE lesson_design_artifacts
           SET revision = revision + 1,
               payload_json = $5::jsonb,
               updated_by = $6,
               updated_at = $7::timestamptz
           WHERE workspace_id = $1 AND lesson_id = $2 AND kind = $3 AND revision = $4
           RETURNING id, workspace_id, lesson_id, kind, revision, payload_json,
                     updated_by, created_at, updated_at`,
          [
            context.workspaceId,
            input.lessonId,
            input.kind,
            input.expectedRevision,
            JSON.stringify(input.payload),
            input.actorUserId,
            new Date(input.at)
          ]
        );
    const row = result.rows[0];
    if (!row) {
      throw new ApplicationError('STALE_VERSION', `${input.kind} changed while it was edited.`);
    }
    return mapArtifact(row);
  }
}
