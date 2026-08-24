import {
  approveGovernedField,
  editGovernedField,
  methodologyPackRegistry,
  validateMethodologyPack,
  type CommunicationTone,
  type GovernedField,
  type Lesson,
  type MethodologyPackRegistry,
  type PedagogicalFocus,
  type PedagogicalStyle,
  type PedagogicalTechnologySelection
} from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext, Telemetry } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import type { AffectedLessonSemanticKey, LessonInvalidation, LessonInvalidationRepository } from './lesson-governance.js';

export type PedagogicalProfileKey = 'pedagogicalStyle' | 'communicationTone' | 'pedagogicalFocus';
export type PedagogicalProfileValue = PedagogicalStyle | CommunicationTone | PedagogicalFocus;

const profileValues: Record<PedagogicalProfileKey, ReadonlySet<string>> = {
  pedagogicalStyle: new Set<PedagogicalStyle>(['CLASSICAL', 'CONSTRUCTIVIST', 'HUMANISTIC', 'GAME_BASED']),
  communicationTone: new Set<CommunicationTone>(['ACADEMIC', 'SUPPORTIVE', 'DIRECT', 'CREATIVE']),
  pedagogicalFocus: new Set<PedagogicalFocus>(['ENGAGEMENT', 'DEPTH', 'META_SKILLS', 'PRACTICAL_APPLICATION'])
};

const PROFILE_IMPACT: Record<PedagogicalProfileKey, readonly AffectedLessonSemanticKey[]> = {
  pedagogicalStyle: ['method', 'technique', 'form', 'stage', 'material', 'assessment', 'homework', 'finalConclusion'],
  communicationTone: ['stage', 'material', 'assessment', 'homework', 'finalConclusion'],
  pedagogicalFocus: ['method', 'technique', 'form', 'stage', 'material', 'assessment', 'homework', 'finalConclusion']
};

export const TECHNOLOGY_IMPACT = ['method', 'technique', 'form', 'stage', 'material', 'assessment', 'homework', 'finalConclusion'] as const;

function profileField(lesson: Lesson, key: PedagogicalProfileKey): GovernedField<PedagogicalProfileValue> | undefined {
  if (key === 'pedagogicalStyle') return lesson.pedagogicalProfile.style;
  if (key === 'communicationTone') return lesson.pedagogicalProfile.communicationTone;
  return lesson.pedagogicalProfile.focus;
}

function withProfileField(lesson: Lesson, key: PedagogicalProfileKey, field: GovernedField<PedagogicalProfileValue>): Lesson {
  if (key === 'pedagogicalStyle') return { ...lesson, pedagogicalProfile: { ...lesson.pedagogicalProfile, style: field as GovernedField<PedagogicalStyle> } };
  if (key === 'communicationTone') return { ...lesson, pedagogicalProfile: { ...lesson.pedagogicalProfile, communicationTone: field as GovernedField<CommunicationTone> } };
  return { ...lesson, pedagogicalProfile: { ...lesson.pedagogicalProfile, focus: field as GovernedField<PedagogicalFocus> } };
}

function assertRevisions(lesson: Lesson, field: GovernedField<unknown> | undefined, expectedLessonVersion: number, expectedFieldRevision?: number): void {
  if (lesson.version !== expectedLessonVersion) throw new ApplicationError('STALE_VERSION', `Lesson ${lesson.id} was modified by another request.`);
  if (expectedFieldRevision !== undefined && (field?.meta.revision ?? 0) !== expectedFieldRevision) {
    throw new ApplicationError('STALE_VERSION', 'Pedagogical decision was modified by another request.', { expectedFieldRevision, actualFieldRevision: field?.meta.revision ?? 0 });
  }
}

interface GovernanceDependencies {
  lessons: LessonRepository;
  invalidations: LessonInvalidationRepository;
  clock: Clock;
  ids: IdGenerator;
  telemetry?: Telemetry;
}

export class EditPedagogicalProfileDecision {
  constructor(private readonly deps: GovernanceDependencies) {}

  async execute(context: RequestContext, input: { lessonId: string; key: PedagogicalProfileKey; value: PedagogicalProfileValue; expectedLessonVersion: number; expectedFieldRevision?: number }): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const current = profileField(lesson, input.key);
    assertRevisions(lesson, current, input.expectedLessonVersion, input.expectedFieldRevision);
    if (!profileValues[input.key].has(input.value)) throw new ApplicationError('VALIDATION_FAILED', `Unsupported ${input.key} value.`);
    const at = this.deps.clock.now().toISOString();
    const next = current
      ? editGovernedField(current, input.value, context.actorUserId, at)
      : { fieldId: this.deps.ids.generate('profile'), value: input.value, meta: { revision: 1, source: 'TEACHER' as const, status: 'EDITED' as const, updatedAt: at, updatedBy: context.actorUserId } };
    const saved = await this.deps.lessons.save(context, withProfileField(lesson, input.key, next), { expectedVersion: input.expectedLessonVersion });
    await this.deps.invalidations.markStale(context, { lessonId: lesson.id, sourceDecisionId: next.fieldId, sourceRevision: next.meta.revision, affectedSemanticKeys: PROFILE_IMPACT[input.key] });
    return { lesson: saved, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
  }
}

export class ApprovePedagogicalProfileDecision {
  constructor(private readonly deps: GovernanceDependencies) {}

  async execute(context: RequestContext, input: { lessonId: string; key: PedagogicalProfileKey; expectedLessonVersion: number; expectedFieldRevision: number }): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const current = profileField(lesson, input.key);
    if (!current) throw new ApplicationError('NOT_FOUND', `Pedagogical decision ${input.key} was not found.`);
    assertRevisions(lesson, current, input.expectedLessonVersion, input.expectedFieldRevision);
    if (current.meta.status === 'APPROVED') return { lesson, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
    const approved = approveGovernedField(current, context.actorUserId, this.deps.clock.now().toISOString());
    const saved = await this.deps.lessons.save(context, withProfileField(lesson, input.key, approved), { expectedVersion: input.expectedLessonVersion });
    return { lesson: saved, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
  }
}

export interface TechnologyOption {
  technologyId: string;
  packId: string;
  packVersion: string;
  name: string;
  description: string;
  phases: Array<{ id: string; title: string; purpose: string }>;
  constraints: string[];
  antiPatterns: string[];
}

export class ListPedagogicalTechnologies {
  constructor(private readonly registry: MethodologyPackRegistry = methodologyPackRegistry) {}
  execute(): TechnologyOption[] {
    return this.registry.listPublished().map((pack) => ({ technologyId: pack.technology.id, packId: pack.id, packVersion: pack.version, name: pack.technology.name, description: pack.technology.description, phases: pack.phases.map(({ id, title, purpose }) => ({ id, title, purpose })), constraints: pack.technology.constraints, antiPatterns: pack.technology.antiPatterns }));
  }
}

export class ApprovePedagogicalTechnology {
  constructor(private readonly deps: GovernanceDependencies & { registry?: MethodologyPackRegistry }) {}

  async execute(context: RequestContext, input: { lessonId: string; technologyId: string; packId: string; packVersion: string; expectedLessonVersion: number; expectedFieldRevision?: number }): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const current = lesson.pedagogicalTechnology;
    assertRevisions(lesson, current, input.expectedLessonVersion, input.expectedFieldRevision);
    const pack = (this.deps.registry ?? methodologyPackRegistry).get(input.packId, input.packVersion);
    if (!pack || pack.status !== 'PUBLISHED' || pack.technology.id !== input.technologyId || validateMethodologyPack(pack).length > 0) {
      throw new ApplicationError('VALIDATION_FAILED', 'Selected pedagogical technology does not belong to a valid published methodology pack.');
    }
    const value: PedagogicalTechnologySelection = { technologyId: pack.technology.id, name: pack.technology.name, methodologyPackId: pack.id, methodologyPackVersion: pack.version };
    if (current?.meta.status === 'APPROVED' && JSON.stringify(current.value) === JSON.stringify(value)) return { lesson, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
    const at = this.deps.clock.now().toISOString();
    const next: GovernedField<PedagogicalTechnologySelection> = { fieldId: current?.fieldId ?? this.deps.ids.generate('technology'), value, meta: { revision: (current?.meta.revision ?? 0) + 1, source: 'TEACHER', status: 'APPROVED', updatedAt: at, updatedBy: context.actorUserId, approvedAt: at, approvedBy: context.actorUserId } };
    const saved = await this.deps.lessons.save(context, { ...lesson, pedagogicalTechnology: next }, { expectedVersion: input.expectedLessonVersion });
    await this.deps.invalidations.markStale(context, { lessonId: lesson.id, sourceDecisionId: next.fieldId, sourceRevision: next.meta.revision, affectedSemanticKeys: TECHNOLOGY_IMPACT });
    this.deps.telemetry?.increment('pedagogy.technology.selected', 1, { technologyId:value.technologyId, packId:value.methodologyPackId, packVersion:value.methodologyPackVersion });
    return { lesson: saved, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
  }
}
