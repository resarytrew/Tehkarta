import type { RequestContext, Telemetry } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import type { ApprovedScenarioContext } from './scenario-context.js';

export type LessonDesignArtifactKind = 'SCENARIO' | 'MATERIALS';

export interface LessonDesignArtifact {
  id: string;
  workspaceId: string;
  lessonId: string;
  kind: LessonDesignArtifactKind;
  revision: number;
  payload: Readonly<Record<string, unknown>>;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonDesignArtifactRepository {
  list(context: RequestContext, lessonId: string): Promise<LessonDesignArtifact[]>;
  save(
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
  ): Promise<LessonDesignArtifact>;
}

function text(value: unknown, field: string, max = 4_000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ApplicationError('VALIDATION_FAILED', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function validateScenario(payload: Readonly<Record<string, unknown>>): void {
  if (!Array.isArray(payload.stages) || payload.stages.length < 1 || payload.stages.length > 12) {
    throw new ApplicationError('VALIDATION_FAILED', 'Scenario must contain between 1 and 12 stages.');
  }
  for (const [index, stage] of payload.stages.entries()) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new ApplicationError('VALIDATION_FAILED', `Scenario stage ${index + 1} is invalid.`);
    }
    const item = stage as Record<string, unknown>;
    text(item.id, `stages[${index}].id`, 200);
    text(item.title, `stages[${index}].title`, 300);
    text(item.teacherAction, `stages[${index}].teacherAction`);
    text(item.studentAction, `stages[${index}].studentAction`);
    if (!Array.isArray(item.technologyPhaseIds) || item.technologyPhaseIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new ApplicationError('VALIDATION_FAILED', `stages[${index}].technologyPhaseIds must be an array of phase ids.`);
    }
    if (!Number.isInteger(item.minutes) || Number(item.minutes) < 1 || Number(item.minutes) > 120) {
      throw new ApplicationError('VALIDATION_FAILED', `stages[${index}].minutes is invalid.`);
    }
  }
}

function assertGroundingMetadata(payload: Readonly<Record<string, unknown>>, approved: ApprovedScenarioContext): void {
  const technology = approved.methodology.technology;
  if (!technology || approved.methodology.technologyRevision === undefined || !approved.methodology.pedagogicalProfileRevision) {
    throw new ApplicationError('DEPENDENCY_STALE', 'Approved pedagogical context is incomplete.');
  }
  const expected: Record<string, string | number> = {
    generatedFromLessonVersion: approved.lesson.version,
    technologyId: technology.technologyId,
    methodologyPackId: technology.methodologyPackId,
    methodologyPackVersion: technology.methodologyPackVersion,
    technologyRevision: approved.methodology.technologyRevision,
    pedagogicalProfileRevision: approved.methodology.pedagogicalProfileRevision
  };
  for (const [key, value] of Object.entries(expected)) {
    if (payload[key] !== value) {
      throw new ApplicationError('DEPENDENCY_STALE', `Artifact was generated from stale ${key}.`, { key, expected: value, actual: payload[key] });
    }
  }
  if (approved.coursePlanning && payload.generatedFromCourseContextRevision !== approved.coursePlanning.contextRevision) {
    throw new ApplicationError('DEPENDENCY_STALE', 'Artifact was generated from a stale course context.', {
      expected: approved.coursePlanning.contextRevision,
      actual: payload.generatedFromCourseContextRevision
    });
  }
}

export function validateScenarioAgainstApprovedContext(
  payload: Readonly<Record<string, unknown>>,
  approved: ApprovedScenarioContext
): void {
  if (!approved.readiness.canGenerateScenario) {
    throw new ApplicationError('DEPENDENCY_STALE', 'Scenario prerequisites are not approved.', { missing: approved.readiness.missing });
  }
  assertGroundingMetadata(payload, approved);
  const stages = payload.stages as Array<Record<string, unknown>>;
  const totalMinutes = stages.reduce((sum, stage) => sum + Number(stage.minutes), 0);
  if (totalMinutes !== approved.lesson.durationMinutes) {
    throw new ApplicationError('VALIDATION_FAILED', `Scenario duration must equal ${approved.lesson.durationMinutes} minutes.`, { totalMinutes });
  }
  const knownPhases = new Set(approved.methodology.canonicalPhases.map((phase) => phase.id));
  const covered = new Set<string>();
  for (const stage of stages) {
    for (const phaseId of stage.technologyPhaseIds as string[]) {
      if (!knownPhases.has(phaseId)) {
        throw new ApplicationError('VALIDATION_FAILED', `Scenario references unknown technology phase ${phaseId}.`);
      }
      covered.add(phaseId);
    }
  }
  const missingPhases = [...knownPhases].filter((phaseId) => !covered.has(phaseId));
  if (missingPhases.length > 0) {
    throw new ApplicationError('VALIDATION_FAILED', 'Scenario does not cover every canonical technology phase.', { missingPhases });
  }
}

export function validateMaterialsAgainstApprovedContext(
  payload: Readonly<Record<string, unknown>>,
  approved: ApprovedScenarioContext,
  scenario: LessonDesignArtifact | undefined
): void {
  assertGroundingMetadata(payload, approved);
  if (!scenario || payload.generatedFromScenarioRevision !== scenario.revision) {
    throw new ApplicationError('DEPENDENCY_STALE', 'Materials must be generated from the current scenario revision.', {
      expected: scenario?.revision ?? null,
      actual: payload.generatedFromScenarioRevision
    });
  }
}

function validateMaterials(payload: Readonly<Record<string, unknown>>): void {
  if (!Array.isArray(payload.items) || payload.items.length > 40) {
    throw new ApplicationError('VALIDATION_FAILED', 'Materials must be an array of at most 40 items.');
  }
  for (const [index, material] of payload.items.entries()) {
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
      throw new ApplicationError('VALIDATION_FAILED', `Material ${index + 1} is invalid.`);
    }
    const item = material as Record<string, unknown>;
    text(item.id, `items[${index}].id`, 200);
    text(item.title, `items[${index}].title`, 500);
    text(item.purpose, `items[${index}].purpose`, 2_000);
    if (typeof item.ready !== 'boolean') {
      throw new ApplicationError('VALIDATION_FAILED', `items[${index}].ready must be boolean.`);
    }
  }
}

export function validateLessonDesignArtifact(
  kind: LessonDesignArtifactKind,
  payload: Readonly<Record<string, unknown>>
): void {
  if (kind === 'SCENARIO') validateScenario(payload);
  else validateMaterials(payload);
}

export class SaveLessonDesignArtifact {
  constructor(
    private readonly deps: {
      lessons: LessonRepository;
      artifacts: LessonDesignArtifactRepository;
      buildApprovedContext?(context: RequestContext, lessonId: string): Promise<ApprovedScenarioContext>;
      now(): Date;
      generateId(prefix: string): string;
      telemetry?: Telemetry;
    }
  ) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      kind: LessonDesignArtifactKind;
      expectedLessonVersion: number;
      expectedRevision: number;
      payload: Readonly<Record<string, unknown>>;
    }
  ): Promise<LessonDesignArtifact> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    if (lesson.version !== input.expectedLessonVersion) {
      throw new ApplicationError('STALE_VERSION', 'Lesson changed while the artifact was edited.');
    }
    validateLessonDesignArtifact(input.kind, input.payload);
    if (this.deps.buildApprovedContext) {
      const approved = await this.deps.buildApprovedContext(context, input.lessonId);
      if (input.kind === 'SCENARIO') {
        validateScenarioAgainstApprovedContext(input.payload, approved);
      } else {
        const current = await this.deps.artifacts.list(context, input.lessonId);
        validateMaterialsAgainstApprovedContext(input.payload, approved, current.find((item) => item.kind === 'SCENARIO'));
      }
    }
    const existing = input.kind === 'SCENARIO' ? await this.deps.artifacts.list(context,input.lessonId) : [];
    const saved = await this.deps.artifacts.save(context, {
      id: this.deps.generateId('artifact'),
      lessonId: input.lessonId,
      kind: input.kind,
      expectedRevision: input.expectedRevision,
      payload: input.payload,
      actorUserId: context.actorUserId,
      at: this.deps.now().toISOString()
    });
    if(input.kind==='SCENARIO')this.deps.telemetry?.increment(existing.some((item)=>item.kind==='SCENARIO')?'lesson.scenario.regenerated':'lesson.scenario.generated',1,{technologyId:String(input.payload.technologyId??'unknown'),packId:String(input.payload.methodologyPackId??'unknown'),packVersion:String(input.payload.methodologyPackVersion??'unknown')});
    return saved;
  }
}
