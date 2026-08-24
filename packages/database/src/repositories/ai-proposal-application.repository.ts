import {
  ApplicationError,
  type ApplyLessonAiProposalCandidateCommitInput,
  type ApplyLessonAiProposalCandidateCommitResult,
  type LessonAiProposalApplicationRepository
} from '@tehkarta/application';
import type { AiProposalCandidate, AiProposalStatus, CoreLessonDecisionKey } from '@tehkarta/application';
import type { RequestContext } from '@tehkarta/ports';
import type { Pool, PoolClient } from 'pg';

interface LockedProposalRow {
  id: string;
  lesson_id: string;
  semantic_key: CoreLessonDecisionKey;
  status: AiProposalStatus;
  base_decision_id: string | null;
  base_revision: number | null;
  requested_lesson_version: number;
  candidates_json: unknown;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  routing_policy_version: string | null;
  applied_candidate_id: string | null;
}

interface LockedDecisionRow {
  id: string;
  revision: number;
}

function candidateById(value: unknown, candidateId: string): AiProposalCandidate | null {
  if (!Array.isArray(value)) return null;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    if (
      item.id === candidateId &&
      typeof item.value === 'string' &&
      typeof item.rationale === 'string'
    ) {
      const result: AiProposalCandidate = {
        id: item.id,
        value: item.value,
        rationale: item.rationale
      };
      if (typeof item.distinction === 'string') result.distinction = item.distinction;
      return result;
    }
  }
  return null;
}

function assertNextDecision(
  context: RequestContext,
  input: ApplyLessonAiProposalCandidateCommitInput,
  current: LockedDecisionRow | null
): void {
  const next = input.nextDecision;
  const expectedRevision = (current?.revision ?? 0) + 1;
  const expectedFieldId = current?.id ?? next.fieldId;

  if (
    next.fieldId !== expectedFieldId ||
    next.meta.revision !== expectedRevision ||
    next.meta.source !== 'TEACHER' ||
    next.meta.status !== 'APPROVED' ||
    next.meta.updatedBy !== context.actorUserId ||
    next.meta.approvedBy !== context.actorUserId ||
    next.meta.updatedAt !== input.appliedAt ||
    next.meta.approvedAt !== input.appliedAt
  ) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'AI proposal apply commit received an invalid teacher-authoritative decision transition.',
      {
        proposalId: input.proposalId,
        expectedFieldId,
        expectedRevision
      }
    );
  }
}

async function lockProposal(
  client: PoolClient,
  context: RequestContext,
  proposalId: string
): Promise<LockedProposalRow | null> {
  const result = await client.query<LockedProposalRow>(
    `SELECT id, lesson_id, semantic_key, status, base_decision_id, base_revision,
            requested_lesson_version, candidates_json, provider, model,
            prompt_version, routing_policy_version, applied_candidate_id
     FROM lesson_ai_proposals
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE`,
    [context.workspaceId, proposalId]
  );
  return result.rows[0] ?? null;
}

/**
 * PostgreSQL implementation of the teacher-apply transaction boundary.
 * No caller can partially apply a candidate: lesson version, governed decision,
 * immutable revision history, dependency invalidations and proposal provenance
 * commit together or roll back together.
 */
export class PostgresLessonAiProposalApplicationRepository
  implements LessonAiProposalApplicationRepository
{
  constructor(private readonly pool: Pool) {}

  async applyCandidate(
    context: RequestContext,
    input: ApplyLessonAiProposalCandidateCommitInput
  ): Promise<ApplyLessonAiProposalCandidateCommitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const proposal = await lockProposal(client, context, input.proposalId);
      if (!proposal || proposal.lesson_id !== input.lessonId) {
        throw new ApplicationError('NOT_FOUND', `AI proposal ${input.proposalId} was not found.`);
      }

      if (proposal.status === 'APPLIED') {
        if (proposal.applied_candidate_id === input.candidateId) {
          await client.query('COMMIT');
          return 'ALREADY_APPLIED';
        }
        throw new ApplicationError(
          'CONFLICT',
          'This AI proposal was already applied using a different candidate.',
          {
            proposalId: proposal.id,
            appliedCandidateId: proposal.applied_candidate_id,
            requestedCandidateId: input.candidateId
          }
        );
      }

      if (proposal.status !== 'READY') {
        throw new ApplicationError(
          'CONFLICT',
          `AI proposal ${proposal.id} cannot be applied from status ${proposal.status}.`,
          { proposalId: proposal.id, status: proposal.status }
        );
      }

      if (proposal.semantic_key !== input.semanticKey) {
        throw new ApplicationError('CONFLICT', 'AI proposal semantic key changed before apply.', {
          proposalId: proposal.id,
          expectedSemanticKey: input.semanticKey,
          actualSemanticKey: proposal.semantic_key
        });
      }

      const candidate = candidateById(proposal.candidates_json, input.candidateId);
      if (!candidate) {
        throw new ApplicationError(
          'NOT_FOUND',
          `AI proposal candidate ${input.candidateId} was not found.`,
          { proposalId: proposal.id }
        );
      }
      if (candidate.value.trim() !== input.nextDecision.value) {
        throw new ApplicationError(
          'CONFLICT',
          'AI proposal candidate content changed before apply.',
          { proposalId: proposal.id, candidateId: input.candidateId }
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
          'Lesson changed after the AI proposal was created.',
          {
            proposalId: proposal.id,
            expectedLessonVersion: input.expectedLessonVersion,
            proposalLessonVersion: proposal.requested_lesson_version,
            actualLessonVersion: lesson.version
          }
        );
      }

      const decisionResult = await client.query<LockedDecisionRow>(
        `SELECT id, revision FROM lesson_decisions
         WHERE workspace_id = $1 AND lesson_id = $2
           AND semantic_key = $3 AND item_key = 'single'
         FOR UPDATE`,
        [context.workspaceId, input.lessonId, input.semanticKey]
      );
      const current = decisionResult.rows[0] ?? null;

      if (proposal.base_decision_id) {
        if (
          !current ||
          current.id !== proposal.base_decision_id ||
          current.revision !== proposal.base_revision ||
          current.id !== input.expectedBaseDecisionId ||
          current.revision !== input.expectedBaseRevision
        ) {
          throw new ApplicationError(
            'DEPENDENCY_STALE',
            'The governed decision changed after this AI proposal was created.',
            {
              proposalId: proposal.id,
              expectedDecisionId: proposal.base_decision_id,
              expectedRevision: proposal.base_revision,
              actualDecisionId: current?.id,
              actualRevision: current?.revision
            }
          );
        }
      } else if (current || input.expectedBaseDecisionId || input.expectedBaseRevision !== undefined) {
        throw new ApplicationError(
          'DEPENDENCY_STALE',
          'The AI proposal expected an empty governed field, but the field has changed.',
          {
            proposalId: proposal.id,
            actualDecisionId: current?.id,
            actualRevision: current?.revision
          }
        );
      }

      assertNextDecision(context, input, current);
      const at = new Date(input.appliedAt);
      const next = input.nextDecision;
      const valueJson = JSON.stringify(next.value);

      const lessonUpdate = await client.query<{ version: number }>(
        `UPDATE lessons
         SET version = version + 1, updated_at = $3
         WHERE id = $1 AND workspace_id = $2 AND version = $4
         RETURNING version`,
        [input.lessonId, context.workspaceId, at, input.expectedLessonVersion]
      );
      if (!lessonUpdate.rows[0]) {
        throw new ApplicationError('STALE_VERSION', 'Lesson changed while applying AI proposal.', {
          proposalId: proposal.id,
          expectedLessonVersion: input.expectedLessonVersion
        });
      }

      if (current) {
        await client.query(
          `UPDATE lesson_decisions
           SET value_json = $4::jsonb,
               source = 'TEACHER', status = 'APPROVED', revision = $5,
               updated_by = $6, approved_by = $6, approved_at = $7, updated_at = $7
           WHERE workspace_id = $1 AND lesson_id = $2 AND id = $3`,
          [
            context.workspaceId,
            input.lessonId,
            current.id,
            valueJson,
            next.meta.revision,
            context.actorUserId,
            at
          ]
        );
      } else {
        await client.query(
          `INSERT INTO lesson_decisions(
             id, workspace_id, lesson_id, semantic_key, item_key, ordinal,
             value_json, source, status, revision, updated_by, approved_by,
             approved_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, 'single', 0,
             $5::jsonb, 'TEACHER', 'APPROVED', $6, $7, $7,
             $8, $8, $8
           )`,
          [
            next.fieldId,
            context.workspaceId,
            input.lessonId,
            input.semanticKey,
            valueJson,
            next.meta.revision,
            context.actorUserId,
            at
          ]
        );
      }

      const provenance = {
        origin: 'AI_PROPOSAL',
        proposalId: proposal.id,
        candidateId: candidate.id,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.prompt_version,
        routingPolicyVersion: proposal.routing_policy_version
      };
      await client.query(
        `INSERT INTO lesson_decision_revisions(
           id, workspace_id, decision_id, lesson_id, revision, value_json,
           source, status, actor_user_id, occurred_at, reason, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb,
           'TEACHER', 'APPROVED', $7, $8, $9, $10::jsonb
         )`,
        [
          `${next.fieldId}:r${next.meta.revision}`,
          context.workspaceId,
          next.fieldId,
          input.lessonId,
          next.meta.revision,
          valueJson,
          context.actorUserId,
          at,
          'Teacher explicitly applied AI proposal candidate',
          JSON.stringify(provenance)
        ]
      );

      for (const semanticKey of input.affectedSemanticKeys) {
        const invalidationId = `${next.fieldId}:r${next.meta.revision}:${semanticKey}`;
        await client.query(
          `INSERT INTO lesson_invalidations(
             id, workspace_id, lesson_id, source_decision_id, source_revision,
             affected_semantic_key, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'STALE', $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            invalidationId,
            context.workspaceId,
            input.lessonId,
            next.fieldId,
            next.meta.revision,
            semanticKey,
            at
          ]
        );
      }

      const applied = await client.query(
        `UPDATE lesson_ai_proposals
         SET status = 'APPLIED', applied_candidate_id = $3,
             applied_decision_id = $4, applied_decision_revision = $5,
             applied_by = $6, applied_at = $7, updated_at = $7,
             error_json = NULL
         WHERE workspace_id = $1 AND id = $2 AND status = 'READY'`,
        [
          context.workspaceId,
          proposal.id,
          candidate.id,
          next.fieldId,
          next.meta.revision,
          context.actorUserId,
          at
        ]
      );
      if (applied.rowCount !== 1) {
        throw new ApplicationError(
          'CONFLICT',
          'AI proposal status changed while the candidate was being applied.',
          { proposalId: proposal.id }
        );
      }

      await client.query('COMMIT');
      return 'APPLIED';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
