import { Pool } from 'pg';
import type { RequestContext } from '@tehkarta/ports';
import { migrateDatabase } from './migrate.js';
import { PostgresLessonScenarioRepository } from './repositories/scenario-application.repository.js';
import { PostgresLessonScenarioProposalRepository } from './repositories/scenario-proposal.repository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for scenario smoke test.');

await migrateDatabase({ databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const context: RequestContext = {
  requestId: 'req_scenario_smoke',
  workspaceId: 'ws_smoke',
  actorUserId: 'usr_smoke',
  roles: ['OWNER'],
  permissions: ['lesson:read', 'lesson:write']
};

try {
  const lessonBefore = await pool.query<{ version: number }>(
    `SELECT version FROM lessons WHERE id = 'lesson_smoke' AND workspace_id = $1`,
    [context.workspaceId]
  );
  const version = lessonBefore.rows[0]?.version;
  if (!version) throw new Error('Scenario smoke could not find lesson_smoke fixture.');

  const proposals = new PostgresLessonScenarioProposalRepository(pool);
  const scenarios = new PostgresLessonScenarioRepository(pool);
  const requestedAt = '2026-08-24T09:00:00.000Z';
  const proposal = await proposals.queue(context, {
    proposalId: 'scenario_proposal_smoke_1',
    jobId: 'scenario_job_smoke_1',
    lessonId: 'lesson_smoke',
    requestedLessonVersion: version,
    contextGuard: {
      version: 'scenario-context-v1',
      lessonVersion: version,
      curriculumPackId: 'curriculum-history-5-9-2026',
      curriculumPackVersion: '2026-dev-1',
      contentPackId: 'umk-history-9-2026',
      contentPackVersion: '2026-dev-1',
      mandatoryRequirementIds: ['rp-smoke-required'],
      includedUmkMappingIds: ['umk-smoke-included']
    },
    candidateCountRequested: 1,
    idempotencyKey: 'scenario-smoke-request-0001',
    requestedAt
  });

  if (proposal.status !== 'QUEUED') throw new Error('Scenario proposal was not queued.');
  const job = await pool.query<{ job_type: string; status: string }>(
    `SELECT job_type, status FROM async_jobs WHERE id = $1`,
    [proposal.asyncJobId]
  );
  if (
    job.rows[0]?.job_type !== 'LESSON_SCENARIO_PROPOSAL' ||
    job.rows[0]?.status !== 'QUEUED'
  ) {
    throw new Error('Scenario proposal did not create the expected durable job.');
  }

  await proposals.markRunning(context, {
    proposalId: proposal.id,
    now: '2026-08-24T09:00:01.000Z'
  });
  const ready = await proposals.markReady(context, {
    proposalId: proposal.id,
    candidates: [
      {
        id: 'scenario-candidate-1',
        title: 'Проверяем причины промышленного рывка',
        rationale: 'Сценарий организует причинный поиск и приводит к аргументированному выводу.',
        stages: [
          {
            id: 'stage-1',
            title: 'Проблематизация',
            minutes: 5,
            teacherAction: 'Ставит проблемный вопрос.',
            studentAction: 'Формулируют исходные гипотезы.',
            techniques: [],
            contentRefs: [{ kind: 'RP_REQUIREMENT', id: 'rp-smoke-required' }]
          },
          {
            id: 'stage-2',
            title: 'Исследование',
            minutes: 30,
            teacherAction: 'Организует проверку гипотез на учебном материале.',
            studentAction: 'Сопоставляют факты, доказательства и выводы.',
            method: 'Проверка гипотез',
            techniques: ['Факт → доказательство → вывод'],
            form: 'Работа в парах',
            contentRefs: [
              { kind: 'RP_REQUIREMENT', id: 'rp-smoke-required' },
              { kind: 'UMK_MAPPING', id: 'umk-smoke-included' }
            ]
          },
          {
            id: 'stage-3',
            title: 'Вывод',
            minutes: 10,
            teacherAction: 'Возвращает к проблемному вопросу.',
            studentAction: 'Формулируют аргументированный ответ.',
            techniques: ['Факт → доказательство → вывод'],
            evidenceOfLearning: 'Ответ содержит причинную связь и опирается на факты.',
            contentRefs: [{ kind: 'RP_REQUIREMENT', id: 'rp-smoke-required' }]
          }
        ]
      }
    ],
    provider: 'scenario-smoke-provider',
    model: 'scenario-smoke-model',
    promptVersion: 'scenario-prompt-smoke-v1',
    routingPolicyVersion: 'routing-v2-smoke',
    now: '2026-08-24T09:00:02.000Z'
  });
  if (ready.status !== 'READY') throw new Error('Scenario proposal did not become READY.');

  const applied = await scenarios.applyCandidate(context, {
    proposalId: proposal.id,
    lessonId: 'lesson_smoke',
    candidateId: 'scenario-candidate-1',
    expectedLessonVersion: version,
    scenarioId: 'scenario_smoke_1',
    appliedAt: '2026-08-24T09:00:03.000Z',
    affectedSemanticKeys: ['material', 'assessment', 'homework', 'finalConclusion']
  });

  if (
    applied.result !== 'APPLIED' ||
    applied.lessonVersion !== version + 1 ||
    applied.scenario.source !== 'TEACHER' ||
    applied.scenario.originKind !== 'AI_PROPOSAL' ||
    applied.scenario.originProposalId !== proposal.id ||
    applied.proposal.status !== 'APPLIED'
  ) {
    throw new Error('Explicit scenario apply did not persist teacher-authoritative state.');
  }

  const revision = await pool.query<{
    source: string;
    origin_kind: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT source, origin_kind, metadata
     FROM lesson_scenario_revisions
     WHERE scenario_id = $1 AND revision = 1`,
    [applied.scenario.id]
  );
  if (
    revision.rows[0]?.source !== 'TEACHER' ||
    revision.rows[0]?.origin_kind !== 'AI_PROPOSAL' ||
    revision.rows[0]?.metadata?.provider !== 'scenario-smoke-provider'
  ) {
    throw new Error('Scenario revision did not preserve teacher authority and AI provenance.');
  }

  const invalidations = await pool.query<{ source_kind: string; affected_semantic_key: string }>(
    `SELECT source_kind, affected_semantic_key
     FROM lesson_invalidations
     WHERE workspace_id = $1 AND lesson_id = 'lesson_smoke'
       AND source_kind = 'SCENARIO' AND source_decision_id = $2`,
    [context.workspaceId, applied.scenario.id]
  );
  const affected = new Set(invalidations.rows.map((row) => row.affected_semantic_key));
  if (
    invalidations.rows.some((row) => row.source_kind !== 'SCENARIO') ||
    !['material', 'assessment', 'homework', 'finalConclusion'].every((key) => affected.has(key))
  ) {
    throw new Error('Scenario apply did not invalidate all downstream artifacts with SCENARIO provenance.');
  }

  const replay = await scenarios.applyCandidate(context, {
    proposalId: proposal.id,
    lessonId: 'lesson_smoke',
    candidateId: 'scenario-candidate-1',
    expectedLessonVersion: version,
    scenarioId: 'scenario_smoke_replay_should_not_be_used',
    appliedAt: '2026-08-24T09:00:04.000Z',
    affectedSemanticKeys: ['material', 'assessment', 'homework', 'finalConclusion']
  });
  if (replay.result !== 'ALREADY_APPLIED' || replay.lessonVersion !== version + 1) {
    throw new Error('Scenario apply idempotent replay changed lesson state.');
  }

  const scenarioRows = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM lesson_scenarios WHERE lesson_id = 'lesson_smoke'`,
    []
  );
  const revisionRows = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM lesson_scenario_revisions WHERE scenario_id = $1`,
    [applied.scenario.id]
  );
  if (scenarioRows.rows[0]?.count !== '1' || revisionRows.rows[0]?.count !== '1') {
    throw new Error('Scenario idempotent replay duplicated authoritative or revision rows.');
  }

  console.info('[database] scenario proposal/apply smoke test passed');
} finally {
  await pool.end();
}
