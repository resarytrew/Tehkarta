import {
  ApplicationError,
  type ApplyLessonScenarioCommitInput,
  type ApplyLessonScenarioCommitResult,
  type LessonScenarioApplicationRepository,
  type LessonScenarioArtifact,
  type LessonScenarioRepository,
  type ScenarioCandidate,
  type ScenarioContentRef,
  type ScenarioStage
} from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';
import { PostgresLessonScenarioProposalRepository } from './scenario-proposal.repository.js';

interface LockedScenarioProposalRow {
  id: string;
  lesson_id: string;
  status: string;
  requested_lesson_version: number;
  candidates_json: unknown;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  routing_policy_version: string | null;
  applied_candidate_id: string | null;
}

interface ScenarioRow {
  id: string;
  workspace_id: string;
  lesson_id: string;
  revision: number;
  status: 'APPROVED';
  title: string;
  rationale: string;
  stages_json: unknown;
  source: 'TEACHER';
  origin_kind: 'AI_PROPOSAL' | 'TEACHER';
  origin_proposal_id: string | null;
  origin_candidate_id: string | null;
  based_on_lesson_version: number;
  approved_by: string;
  approved_at: Date;
  updated_at: Date;
}

function contentRef(value: unknown): ScenarioContentRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    (item.kind === 'RP_REQUIREMENT' || item.kind === 'UMK_MAPPING') &&
    typeof item.id === 'string'
  ) {
    return { kind: item.kind, id: item.id };
  }
  return null;
}

function stage(value: unknown): ScenarioStage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.minutes !== 'number' ||
    typeof item.teacherAction !== 'string' ||
    typeof item.studentAction !== 'string' ||
    !Array.isArray(item.techniques) ||
    !item.techniques.every((entry) => typeof entry === 'string') ||
    !Array.isArray(item.contentRefs)
  ) {
    return null;
  }
  const refs = item.contentRefs.map(contentRef);
  if (refs.some((entry) => entry === null)) return null;
  const result: ScenarioStage = {
    id: item.id,
    title: item.title,
    minutes: item.minutes,
    teacherAction: item.teacherAction,
    studentAction: item.studentAction,
    techniques: [...item.techniques] as string[],
    contentRefs: refs as ScenarioContentRef[]
  };
  if (typeof item.method === 'string') result.method = item.method;
  if (typeof item.form === 'string') result.form = item.form;
  if (typeof item.evidenceOfLearning === 'string') result.evidenceOfLearning = item.evidenceOfLearning;
  return result;
}

function candidateById(value: unknown, candidateId: string): ScenarioCandidate | null {
  if (!Array.isArray(value)) return null;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (
      item.id !== candidateId ||
      typeof item.title !== 'string' ||
      typeof item.rationale !== 'string' ||
      !Array.isArray(item.stages)
    ) {
      continue;
    }
    const stages = item.stages.map(stage);
    if (stages.some((entry) => entry === null)) return null;
    return {
      id: candidateId,
      title: item.title,
      rationale: item.rationale,
      stages: stages as ScenarioStage[]
    };
  }
  return null;
}

function stages(value: unknown): ScenarioStage[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map(stage);
  return parsed.filter((entry): entry is ScenarioStage => entry !== null);
}

function mapScenario(row: ScenarioRow): LessonScenarioArtifact {
  const artifact: LessonScenarioArtifact = {
    id: row.id,
    workspaceId: row.workspace_id,
    lessonId: row.lesson_id,
    revision: row.revision,
    status: row.status,
    title: row.title,
    rationale: row.rationale,
    stages: stages(row.stages_json),
    source: row.source,
    originKind: row.origin_kind,
    basedOnLessonVersion: row.based_on_lesson_version,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
  if (row.origin_proposal_id) artifact.originProposalId = row.origin_proposal_id;
  if (row.origin_candidate_id) artifact.originCandidateId = row.origin_candidate_id;
  return artifact;
}

const SCENARIO_COLUMNS = `
  id, workspace_id, lesson_id, revision, status, title, rationale,
  stages_json, source, origin_kind, origin_proposal_id, origin_candidate_id,
  based_on_lesson_version, approved_by, approved_at, updated_at
`;

async function lockProposal(
  client: PoolClient,
  context: RequestContext,
  proposalId: string
): Promise<LockedScenarioProposalRow | null> {
  const result = await client.query<LockedScenarioProposalRow>(
    `SELECT id, lesson_id, status, requested_lesson_version, candidates_json,
            provider, model, prompt_version, routing_policy_version,
            applied_candidate_id
     FROM lesson_scenario_proposals
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE`,
    [context.workspaceId, proposalId]
  );
  return result.rows[0] ?? null;
}

export class PostgresLessonScenarioRepository
  implements LessonScenarioRepository, LessonScenarioApplicationRepository
{
  constructor(private readonly pool: Pool) {}

  async getByLesson(context: RequestContext, lessonId: string): Promise<LessonScenarioArtifact | null> {
    const result = await this.pool.query<ScenarioRow>(
      `SELECT ${SCENARIO_COLUMNS}
       FROM lesson_scenarios
       WHERE workspace_id = $1 AND lesson_id = $2`,
      [context.workspaceId, lessonId]
    );
    const row = result.rows[0];
    return row ? mapScenario(row) : null;
  }

  async applyCandidate(
    context: RequestContext,
    input: ApplyLessonScenarioCommitInput
  ): Promise<ApplyLessonScenarioCommitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const proposal = await lockProposal(client, context, input.proposalId);
      if (!proposal || proposal.lesson_id !== input.lessonId) {
        throw new ApplicationError('NOT_FOUND', `Scenario proposal ${input.proposalId} was not found.`);
      }

      const candidate = candidateById(proposal.candidates_json, input.candidateId);
      if (!candidate) {
        throw new ApplicationError(
          'NOT_FOUND',
          `Scenario candidate ${input.candidateId} was not found.`,
          { proposalId: proposal.id }
        );
      }

      if (proposal.status === 'APPLIED') {
        if (proposal.applied_candidate_id !== input.candidateId) {
          throw new ApplicationError(
            'CONFLICT',
            'This scenario proposal was already applied using a different candidate.',
            {
              proposalId: proposal.id,
              appliedCandidateId: proposal.applied_candidate_id,
              requestedCandidateId: input.candidateId
            }
          );
        }
        const existingResult = await client.query<ScenarioRow>(
          `SELECT ${SCENARIO_COLUMNS}
           FROM lesson_scenarios
           WHERE workspace_id = $1 AND lesson_id = $2
             AND origin_proposal_id = $3 AND origin_candidate_id = $4`,
          [context.workspaceId, input.lessonId, proposal.id, input.candidateId]
        );
        const existing = existingResult.rows[0];
        if (!existing) {
          throw new ApplicationError(
            'CONFLICT',
            'This applied scenario proposal has already been superseded by a newer scenario.',
            { proposalId: proposal.id }
          );
        }
        const lessonResult = await client.query<{ version: number }>(
          `SELECT version FROM lessons WHERE id = $1 AND workspace_id = $2`,
          [input.lessonId, context.workspaceId]
        );
        await client.query('COMMIT');
        const persistedProposal = await new PostgresLessonScenarioProposalRepository(this.pool).getById(
          context,
          proposal.id
        );
        if (!persistedProposal || !lessonResult.rows[0]) {
          throw new Error('Applied scenario replay could not restore persisted state.');
        }
        return {
          result: 'ALREADY_APPLIED',
          proposal: persistedProposal,
          scenario: mapScenario(existing),
          lessonVersion: lessonResult.rows[0].version
        };
      }

      if (proposal.status !== 'READY') {
        throw new ApplicationError(
          'CONFLICT',
          `Scenario proposal ${proposal.id} cannot be applied from status ${proposal.status}.`
        );
      }

      const lessonResult = await client.query<{ version: number }>(
        `SELECT version FROM lessons
         WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
         FOR UPDATE`,
        [input.lessonId, context.workspaceId]
      );
      const lesson = lessonResult.rows[0];
      if (!lesson) {
        throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
      }
      if (
        lesson.version !== input.expectedLessonVersion ||
        lesson.version !== proposal.requested_lesson_version
      ) {
        throw new ApplicationError(
          'STALE_VERSION',
          'Lesson changed after the scenario proposal was generated.',
          {
            proposalId: proposal.id,
            expectedLessonVersion: input.expectedLessonVersion,
            proposalLessonVersion: proposal.requested_lesson_version,
            actualLessonVersion: lesson.version
          }
        );
      }

      const currentResult = await client.query<ScenarioRow>(
        `SELECT ${SCENARIO_COLUMNS}
         FROM lesson_scenarios
         WHERE workspace_id = $1 AND lesson_id = $2
         FOR UPDATE`,
        [context.workspaceId, input.lessonId]
      );
      const current = currentResult.rows[0] ?? null;
      const scenarioId = current?.id ?? input.scenarioId;
      const revision = (current?.revision ?? 0) + 1;
      const at = new Date(input.appliedAt);
      const serializedStages = JSON.stringify(candidate.stages);

      const updatedLesson = await client.query<{ version: number }>(
        `UPDATE lessons
         SET version = version + 1, updated_at = $3
         WHERE id = $1 AND workspace_id = $2 AND version = $4
         RETURNING version`,
        [input.lessonId, context.workspaceId, at, input.expectedLessonVersion]
      );
      const nextLessonVersion = updatedLesson.rows[0]?.version;
      if (!nextLessonVersion) {
        throw new ApplicationError('STALE_VERSION', 'Lesson changed while applying scenario proposal.');
      }

      const scenarioResult = await client.query<ScenarioRow>(
        `INSERT INTO lesson_scenarios(
           id, workspace_id, lesson_id, revision, status, title, rationale,
           stages_json, source, origin_kind, origin_proposal_id, origin_candidate_id,
           based_on_lesson_version, approved_by, approved_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, 'APPROVED', $5, $6,
           $7::jsonb, 'TEACHER', 'AI_PROPOSAL', $8, $9,
           $10, $11, $12, $12, $12
         )
         ON CONFLICT (workspace_id, lesson_id) DO UPDATE SET
           revision = EXCLUDED.revision,
           status = 'APPROVED',
           title = EXCLUDED.title,
           rationale = EXCLUDED.rationale,
           stages_json = EXCLUDED.stages_json,
           source = 'TEACHER',
           origin_kind = 'AI_PROPOSAL',
           origin_proposal_id = EXCLUDED.origin_proposal_id,
           origin_candidate_id = EXCLUDED.origin_candidate_id,
           based_on_lesson_version = EXCLUDED.based_on_lesson_version,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at,
           updated_at = EXCLUDED.updated_at
         RETURNING ${SCENARIO_COLUMNS}`,
        [
          scenarioId,
          context.workspaceId,
          input.lessonId,
          revision,
          candidate.title,
          candidate.rationale,
          serializedStages,
          proposal.id,
          candidate.id,
          input.expectedLessonVersion,
          context.actorUserId,
          at
        ]
      );
      const scenario = scenarioResult.rows[0];
      if (!scenario) throw new Error('Scenario was not persisted.');

      await client.query(
        `INSERT INTO lesson_scenario_revisions(
           id, workspace_id, scenario_id, lesson_id, revision, title, rationale,
           stages_json, source, origin_kind, origin_proposal_id, origin_candidate_id,
           based_on_lesson_version, actor_user_id, occurred_at, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8::jsonb, 'TEACHER', 'AI_PROPOSAL', $9, $10,
           $11, $12, $13, $14::jsonb
         )`,
        [
          `${scenarioId}:r${revision}`,
          context.workspaceId,
          scenarioId,
          input.lessonId,
          revision,
          candidate.title,
          candidate.rationale,
          serializedStages,
          proposal.id,
          candidate.id,
          input.expectedLessonVersion,
          context.actorUserId,
          at,
          JSON.stringify({
            origin: 'AI_SCENARIO_PROPOSAL',
            proposalId: proposal.id,
            candidateId: candidate.id,
            provider: proposal.provider,
            model: proposal.model,
            promptVersion: proposal.prompt_version,
            routingPolicyVersion: proposal.routing_policy_version
          })
        ]
      );

      for (const semanticKey of input.affectedSemanticKeys) {
        const invalidationId = `${scenarioId}:r${revision}:${semanticKey}`;
        await client.query(
          `INSERT INTO lesson_invalidations(
             id, workspace_id, lesson_id, source_decision_id, source_revision,
             affected_semantic_key, status, created_at, source_kind
           ) VALUES ($1, $2, $3, $4, $5, $6, 'STALE', $7, 'SCENARIO')
           ON CONFLICT (id) DO NOTHING`,
          [
            invalidationId,
            context.workspaceId,
            input.lessonId,
            scenarioId,
            revision,
            semanticKey,
            at
          ]
        );
      }

      const applied = await client.query(
        `UPDATE lesson_scenario_proposals
         SET status = 'APPLIED', applied_candidate_id = $3,
             applied_by = $4, applied_at = $5, updated_at = $5,
             error_json = NULL
         WHERE workspace_id = $1 AND id = $2 AND status = 'READY'`,
        [context.workspaceId, proposal.id, candidate.id, context.actorUserId, at]
      );
      if (!applied.rowCount) {
        throw new ApplicationError('CONFLICT', 'Scenario proposal changed while being applied.');
      }

      await client.query('COMMIT');
      const persistedProposal = await new PostgresLessonScenarioProposalRepository(this.pool).getById(
        context,
        proposal.id
      );
      if (!persistedProposal) throw new Error('Applied scenario proposal was not restored after commit.');

      return {
        result: 'APPLIED',
        proposal: persistedProposal,
        scenario: mapScenario(scenario),
        lessonVersion: nextLessonVersion
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A transaction that was already committed in the idempotent replay path
        // must not hide the original error if restoring state unexpectedly fails.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
