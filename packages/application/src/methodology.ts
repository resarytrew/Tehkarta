import {
  approvedPedagogicalProfile,
  approvedValue,
  methodologyPackRegistry,
  type GovernedField,
  type Lesson,
  type MethodSelection,
  type MethodDefinition,
  type MethodologyPack,
  type MethodologyPackRef,
  type OrganizationalFormDefinition,
  type OutcomeKind,
  type TechniqueDefinition,
  type TechniqueSelection,
  type OrganizationalFormSelection,
  type ApprovedPedagogicalProfile,
  type MethodologyPackRegistry,
  type PedagogicalFocus
} from '@tehkarta/domain';
import type { Clock, IdGenerator, RequestContext, Telemetry } from '@tehkarta/ports';
import { ApplicationError, type LessonRepository } from './index.js';
import type { LessonInvalidation, LessonInvalidationRepository } from './lesson-governance.js';
import type { ApprovedCourseLessonContext, CoursePlanningRepository } from './course-planning.js';

export interface RecommendationOutcomeRef {
  fieldId: string;
  revision: number;
  value: string;
  inferredKinds: OutcomeKind[];
}

export interface MethodologyRecommendation {
  id: string;
  packRef: MethodologyPackRef;
  technology: { id: string; name: string };
  technologyPhase: { id: string; name: string };
  targetOutcome: RecommendationOutcomeRef;
  method: Pick<MethodDefinition, 'id' | 'name' | 'description' | 'preparation' | 'constraints' | 'antiPatterns'>;
  suggestedTechniques: Array<Pick<TechniqueDefinition, 'id' | 'name' | 'description' | 'instructions' | 'typicalMinutes'>>;
  compatibleForms: Array<Pick<OrganizationalFormDefinition, 'id' | 'name' | 'participantPattern' | 'constraints'>>;
  rationale: string;
  estimatedMinutes: { min: number; max: number };
  constraintNotes: string[];
}

export interface MethodologyRecommendationBundle {
  pack: {
    id: string;
    version: string;
    title: string;
    technology: { id: string; name: string; description: string; antiPatterns: string[] };
  };
  recommendations: MethodologyRecommendation[];
  technologyRevision: number;
  profileInfluence?: { focus: PedagogicalFocus; note: string };
  courseContext?: {
    planRevision: number;
    contextRevision: string;
    previousLessonCount: number;
    masteredConcepts: string[];
    currentTopic?: string;
    nextTopics: string[];
    approvedSourceCount: number;
  };
}

export interface MethodologyRecommendationContext {
  lesson: Lesson;
  pack: MethodologyPack;
  courseContext?: ApprovedCourseLessonContext;
  pedagogicalProfile?: ApprovedPedagogicalProfile;
}

function resolveApprovedPack(lesson: Lesson, registry: MethodologyPackRegistry = methodologyPackRegistry): MethodologyPack {
  const selection = approvedValue(lesson.pedagogicalTechnology);
  if (!selection) throw new ApplicationError('DEPENDENCY_STALE', 'Сначала утвердите педагогическую технологию.');
  const pack = registry.get(selection.methodologyPackId, selection.methodologyPackVersion);
  if (!pack || pack.technology.id !== selection.technologyId) {
    throw new ApplicationError('DEPENDENCY_STALE', 'Утверждённая технология ссылается на недоступную версию методического пакета.');
  }
  return pack;
}

export interface MethodologyFeedbackRepository {
  listRejectedIds(context: RequestContext, lessonId: string): Promise<string[]>;
  reject(
    context: RequestContext,
    input: {
      lessonId: string;
      recommendationId: string;
      packId: string;
      packVersion: string;
      actorUserId: string;
      at: string;
    }
  ): Promise<void>;
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

function includesAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function inferOutcomeKinds(value: string): OutcomeKind[] {
  const text = normalizeText(value);
  const kinds = new Set<OutcomeKind>();

  if (includesAny(text, ['причин', 'почему', 'объясн', 'следств', 'фактор', 'связ'])) kinds.add('CAUSAL_EXPLANATION');
  if (includesAny(text, ['источник', 'документ', 'свидетельств', 'текст', 'цитат'])) kinds.add('SOURCE_ANALYSIS');
  if (includesAny(text, ['сравн', 'сопостав', 'различ', 'сходств'])) kinds.add('COMPARISON');
  if (includesAny(text, ['данн', 'статист', 'числ', 'процент', 'график', 'таблиц', 'динамик'])) kinds.add('DATA_INTERPRETATION');
  if (includesAny(text, ['карт', 'простран', 'территор', 'маршрут', 'географ'])) kinds.add('CARTOGRAPHY');
  if (includesAny(text, ['модел', 'схем', 'структур', 'систем'])) kinds.add('MODELING');
  if (includesAny(text, ['аргумент', 'доказ', 'обоснов', 'подтверд', 'вывод'])) kinds.add('ARGUMENTATION');
  if (kinds.size === 0) kinds.add('KNOWLEDGE');
  return [...kinds];
}

function methodScore(
  method: MethodDefinition,
  kinds: OutcomeKind[],
  text: string,
  courseContext?: ApprovedCourseLessonContext,
  focus?: PedagogicalFocus
): number {
  let score = kinds.filter((kind) => method.compatibleOutcomeKinds.includes(kind)).length * 10;
  if (method.id === 'hypothesis-testing' && includesAny(text, ['причин', 'почему', 'объясн', 'фактор'])) score += 12;
  if (method.id === 'source-analysis' && includesAny(text, ['источник', 'документ', 'доказ', 'свидетельств'])) score += 10;
  if (method.id === 'comparative' && includesAny(text, ['сравн', 'сопостав', 'различ', 'сходств'])) score += 12;
  if (method.id === 'statistical' && includesAny(text, ['данн', 'статист', 'числ', 'процент', 'таблиц', 'график'])) score += 12;
  if (method.id === 'cartographic' && includesAny(text, ['карт', 'простран', 'территор', 'маршрут'])) score += 12;
  if (method.id === 'modeling' && includesAny(text, ['модел', 'схем', 'систем'])) score += 12;
  if (courseContext) {
    if (method.id === 'source-analysis' && courseContext.sourceFragments.length > 0) score += 4;
    if (method.id === 'comparative' && courseContext.previousLessons.length > 0) score += 3;
    if (method.id === 'hypothesis-testing' && courseContext.previousLessons.length > 1) score += 2;
  }
  if (focus && method.focusSignals?.includes(focus)) score += 4;
  return score;
}

function recommendationId(
  pack: MethodologyPack,
  _lesson: Lesson,
  outcome: GovernedField<string>,
  methodId: string,
  technologyRevision: number,
  profileRevision: string,
  courseContext?: ApprovedCourseLessonContext
): string {
  // Recommendation IDs are used as route parameters. Keep them comfortably below
  // Fastify's parameter-length guard while retaining stable identity across reads.
  // Governed field IDs are globally generated; the last 36 chars preserve the UUID
  // portion for generated IDs, while pack version + field revision + method keep
  // recommendations distinct across methodology and lesson revisions.
  const outcomeIdentity = outcome.fieldId.slice(-36).replace(/[^a-zA-Z0-9_.:-]+/g, '-');
  const packVersion = pack.version.replace(/[^a-zA-Z0-9_.:-]+/g, '-');
  const method = methodId.replace(/[^a-zA-Z0-9_.:-]+/g, '-');
  const courseRevision = courseContext
    ? `_c${courseContext.contextRevision.replace(/[^a-zA-Z0-9_.:-]+/g, '-')}`
    : '';
  return `mrec_${packVersion}_t${technologyRevision}_p${profileRevision}_${outcomeIdentity}_r${outcome.meta.revision}_${method}${courseRevision}`;
}

function rationaleFor(
  method: MethodDefinition,
  kinds: OutcomeKind[],
  problemQuestion?: string,
  courseContext?: ApprovedCourseLessonContext
): string {
  const kindCopy: Record<OutcomeKind, string> = {
    KNOWLEDGE: 'осмысленное предметное знание',
    CAUSAL_EXPLANATION: 'причинно-следственное объяснение',
    SOURCE_ANALYSIS: 'анализ исторического источника',
    COMPARISON: 'сопоставление по критериям',
    DATA_INTERPRETATION: 'интерпретация исторических данных',
    CARTOGRAPHY: 'пространственный анализ',
    MODELING: 'построение и проверка модели',
    ARGUMENTATION: 'аргументированный вывод'
  };
  const targets = kinds.map((kind) => kindCopy[kind]).slice(0, 3).join(', ');
  const questionNote = problemQuestion
    ? ` Метод согласуется с утверждённым проблемным вопросом «${problemQuestion}», но не подменяет результат урока.`
    : '';
  const mastered = courseContext?.previousLessons.flatMap((lesson) => lesson.concepts).slice(0, 5) ?? [];
  const courseNote = courseContext
    ? ` Рекомендация учитывает утверждённый план курса (редакция ${courseContext.planRevision})${mastered.length > 0 ? ` и уже освоенные понятия: ${mastered.join(', ')}` : ''}. Текущая тема: «${courseContext.currentLesson?.topic ?? 'не указана'}»${courseContext.nextLessons[0] ? `; следующий смысловой шаг — «${courseContext.nextLessons[0].topic}»` : ''}.`
    : '';
  return `Метод «${method.name}» напрямую поддерживает: ${targets}.${questionNote}${courseNote}`;
}

export function recommendMethodologyFromContext(context: MethodologyRecommendationContext): MethodologyRecommendationBundle {
  const { lesson, pack, courseContext, pedagogicalProfile } = context;
  const technologyRevision = lesson.pedagogicalTechnology?.meta.revision ?? 0;
  const profileRevision = [lesson.pedagogicalProfile.style?.meta.revision ?? 0, lesson.pedagogicalProfile.communicationTone?.meta.revision ?? 0, lesson.pedagogicalProfile.focus?.meta.revision ?? 0].join('-');
  const approvedOutcomes = lesson.outcomes.filter((field) => approvedValue(field) !== undefined);
  const problemQuestion = approvedValue(lesson.problemQuestion);
  const recommendations: MethodologyRecommendation[] = [];

  for (const outcome of approvedOutcomes) {
    const value = approvedValue(outcome)!;
    const text = normalizeText(value);
    const kinds = inferOutcomeKinds(value);
    let ranked = pack.methods
      .map((method) => ({ method, score: methodScore(method, kinds, text, courseContext, pedagogicalProfile?.focus) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.method.name.localeCompare(b.method.name, 'ru'));

    if (ranked.length === 0) {
      ranked = pack.methods.slice(0, 2).map((method) => ({ method, score: 1 }));
    }

    for (const { method } of ranked.slice(0, 2)) {
      const phaseId = method.compatibleTechnologyPhaseIds[0];
      const phase = pack.phases.find((item) => item.id === phaseId);
      if (!phase) continue;

      const techniques = pack.techniques
        .filter((technique) => technique.methodIds.includes(method.id))
        .slice(0, 3);
      const compatibleForms = pack.forms.filter((form) => {
        if (form.id === 'rotating-groups' && method.typicalMinutes.max < 10) return false;
        return true;
      });

      const constraintNotes = [...method.constraints];
      if (method.typicalMinutes.max > Math.floor(lesson.durationMinutes * 0.35)) {
        constraintNotes.push(
          `Верхняя оценка ${method.typicalMinutes.max} мин занимает значительную часть ${lesson.durationMinutes}-минутного урока: сократите набор доказательств или число приёмов.`
        );
      }
      if (method.preparation.length > 0) {
        constraintNotes.push(`Подготовка педагога: ${method.preparation.join(' ')}`);
      }

      recommendations.push({
        id: recommendationId(pack, lesson, outcome, method.id, technologyRevision, profileRevision, courseContext),
        packRef: { id: pack.id, version: pack.version },
        technology: { id: pack.technology.id, name: pack.technology.name },
        technologyPhase: { id: phase.id, name: phase.title },
        targetOutcome: {
          fieldId: outcome.fieldId,
          revision: outcome.meta.revision,
          value,
          inferredKinds: kinds
        },
        method: {
          id: method.id,
          name: method.name,
          description: method.description,
          preparation: method.preparation,
          constraints: method.constraints,
          antiPatterns: method.antiPatterns
        },
        suggestedTechniques: techniques.map((technique) => ({
          id: technique.id,
          name: technique.name,
          description: technique.description,
          instructions: technique.instructions,
          typicalMinutes: technique.typicalMinutes
        })),
        compatibleForms: compatibleForms.map((form) => ({
          id: form.id,
          name: form.name,
          participantPattern: form.participantPattern,
          constraints: form.constraints
        })),
        rationale: rationaleFor(method, kinds, problemQuestion, courseContext),
        estimatedMinutes: method.typicalMinutes,
        constraintNotes
      });
    }
  }

  const masteredConcepts = courseContext
    ? [...new Set(courseContext.previousLessons.flatMap((lesson) => lesson.concepts))]
    : [];
  return {
    pack: {
      id: pack.id,
      version: pack.version,
      title: pack.title,
      technology: {
        id: pack.technology.id,
        name: pack.technology.name,
        description: pack.technology.description,
        antiPatterns: pack.technology.antiPatterns
      }
    },
    recommendations,
    technologyRevision,
    ...(pedagogicalProfile ? { profileInfluence: { focus: pedagogicalProfile.focus, note: 'Фокус влияет на порядок совместимых методов, но не отменяет ограничения технологии и результата.' } } : {}),
    ...(courseContext
      ? {
          courseContext: {
            planRevision: courseContext.planRevision,
            contextRevision: courseContext.contextRevision,
            previousLessonCount: courseContext.previousLessons.length,
            masteredConcepts,
            ...(courseContext.currentLesson ? { currentTopic: courseContext.currentLesson.topic } : {}),
            nextTopics: courseContext.nextLessons.map((lesson) => lesson.topic),
            approvedSourceCount: new Set(courseContext.sourceFragments.map((fragment) => fragment.sourceId)).size
          }
        }
      : {})
  };
}

export function recommendMethodology(
  lesson: Lesson,
  pack?: MethodologyPack,
  courseContext?: ApprovedCourseLessonContext
): MethodologyRecommendationBundle {
  const resolvedPack = pack ?? resolveApprovedPack(lesson);
  const profile = approvedPedagogicalProfile(lesson.pedagogicalProfile);
  return recommendMethodologyFromContext({ lesson, pack: resolvedPack, ...(courseContext ? { courseContext } : {}), ...(profile ? { pedagogicalProfile: profile } : {}) });
}

function approvedTeacherField<T>(
  ids: IdGenerator,
  prefix: string,
  value: T,
  actorUserId: string,
  at: string
): GovernedField<T> {
  return {
    fieldId: ids.generate(prefix),
    value,
    meta: {
      revision: 1,
      source: 'TEACHER',
      status: 'APPROVED',
      updatedAt: at,
      updatedBy: actorUserId,
      approvedAt: at,
      approvedBy: actorUserId
    }
  };
}

function appendUnique<T>(
  current: GovernedField<T>[],
  value: T,
  identity: (value: T) => string,
  ids: IdGenerator,
  prefix: string,
  actor: string,
  at: string
): { fields: GovernedField<T>[]; added?: GovernedField<T> } {
  if (current.some((field) => identity(field.value) === identity(value) && field.meta.status === 'APPROVED')) return { fields: current };
  const added = approvedTeacherField(ids, prefix, value, actor, at);
  return { fields: [...current, added], added };
}

const METHOD_DOWNSTREAM_KEYS = [
  'content',
  'stage',
  'material',
  'assessment',
  'homework',
  'finalConclusion'
] as const;

const OUTCOME_DOWNSTREAM_KEYS = [
  'method',
  'technique',
  'form',
  'content',
  'stage',
  'assessment',
  'homework',
  'finalConclusion'
] as const;

export class ListMethodologyRecommendations {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly feedback: MethodologyFeedbackRepository,
    private readonly registry: MethodologyPackRegistry = methodologyPackRegistry,
    private readonly planning?: CoursePlanningRepository,
    private readonly telemetry?: Telemetry
  ) {}

  async execute(context: RequestContext, lessonId: string): Promise<MethodologyRecommendationBundle> {
    const lesson = await this.lessons.getById(context, lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${lessonId} was not found.`);
    const courseContext = this.planning
      ? await this.planning.getApprovedLessonContext(context, lesson.courseId, lesson.id)
      : null;
    const started=Date.now();
    const bundle = recommendMethodology(lesson, resolveApprovedPack(lesson, this.registry), courseContext ?? undefined);
    this.telemetry?.increment('methodology.recommendation.generated', bundle.recommendations.length, { packId:bundle.pack.id, packVersion:bundle.pack.version, technologyId:bundle.pack.technology.id });
    this.telemetry?.timing('methodology.recommendation.duration', Date.now()-started, { packId:bundle.pack.id, packVersion:bundle.pack.version });
    const rejected = new Set(await this.feedback.listRejectedIds(context, lessonId));
    return { ...bundle, recommendations: bundle.recommendations.filter((item) => !rejected.has(item.id)) };
  }
}

export class AddApprovedLessonOutcome {
  constructor(
    private readonly deps: {
      lessons: LessonRepository;
      invalidations: LessonInvalidationRepository;
      clock: Clock;
      ids: IdGenerator;
    }
  ) {}

  async execute(
    context: RequestContext,
    input: { lessonId: string; value: string; expectedLessonVersion: number }
  ): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const value = input.value.trim();
    if (value.length < 3 || value.length > 4_000) {
      throw new ApplicationError('VALIDATION_FAILED', 'Outcome text must contain between 3 and 4000 characters.');
    }
    if (lesson.outcomes.some((field) => field.value.trim() === value && field.meta.status === 'APPROVED')) {
      throw new ApplicationError('CONFLICT', 'This approved lesson outcome already exists.');
    }

    const at = this.deps.clock.now().toISOString();
    const outcome = approvedTeacherField(this.deps.ids, 'outcome', value, context.actorUserId, at);
    const saved = await this.deps.lessons.save(
      context,
      { ...lesson, outcomes: [...lesson.outcomes, outcome] },
      { expectedVersion: input.expectedLessonVersion }
    );
    await this.deps.invalidations.markStale(context, {
      lessonId: lesson.id,
      sourceDecisionId: outcome.fieldId,
      sourceRevision: outcome.meta.revision,
      affectedSemanticKeys: OUTCOME_DOWNSTREAM_KEYS
    });
    return { lesson: saved, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
  }
}

export class ApplyMethodologyRecommendation {
  constructor(
    private readonly deps: {
      lessons: LessonRepository;
      invalidations: LessonInvalidationRepository;
      clock: Clock;
      ids: IdGenerator;
      registry?: MethodologyPackRegistry;
      planning?: CoursePlanningRepository;
      telemetry?: Telemetry;
    }
  ) {}

  async execute(
    context: RequestContext,
    input: {
      lessonId: string;
      recommendationId: string;
      methodId: string;
      formId: string;
      techniqueIds?: string[];
      expectedLessonVersion: number;
    }
  ): Promise<{ lesson: Lesson; invalidations: LessonInvalidation[] }> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const pack = resolveApprovedPack(lesson, this.deps.registry);
    const courseContext = this.deps.planning
      ? await this.deps.planning.getApprovedLessonContext(context, lesson.courseId, lesson.id)
      : null;
    const current = recommendMethodology(lesson, pack, courseContext ?? undefined).recommendations.find((item) => item.id === input.recommendationId);
    if (!current) {
      throw new ApplicationError('DEPENDENCY_STALE', 'Methodology recommendation no longer matches the approved lesson state.');
    }
    if (current.method.id !== input.methodId) {
      throw new ApplicationError('DEPENDENCY_STALE', 'Selected method no longer matches the current recommendation.');
    }
    const form = current.compatibleForms.find((item) => item.id === input.formId);
    if (!form) throw new ApplicationError('VALIDATION_FAILED', 'Selected organizational form is not compatible with this recommendation.');

    const allowedTechniqueIds = new Set(current.suggestedTechniques.map((item) => item.id));
    const requestedTechniqueIds = input.techniqueIds ?? current.suggestedTechniques.map((item) => item.id);
    if (requestedTechniqueIds.some((id) => !allowedTechniqueIds.has(id))) {
      throw new ApplicationError('VALIDATION_FAILED', 'A selected technique is not part of the current recommendation.');
    }

    const at = this.deps.clock.now().toISOString();
    const technology = approvedValue(lesson.pedagogicalTechnology)!;
    const methodSelection: MethodSelection = {
      methodId: current.method.id,
      name: current.method.name,
      technologyId: technology.technologyId,
      methodologyPackId: pack.id,
      methodologyPackVersion: pack.version,
      targetOutcomeFieldId: current.targetOutcome.fieldId,
      targetOutcomeRevision: current.targetOutcome.revision,
      technologyRevision: lesson.pedagogicalTechnology!.meta.revision,
      pedagogicalProfileRevision: [lesson.pedagogicalProfile.style?.meta.revision ?? 0, lesson.pedagogicalProfile.communicationTone?.meta.revision ?? 0, lesson.pedagogicalProfile.focus?.meta.revision ?? 0].join('-')
    };
    const methodResult = appendUnique(lesson.selectedMethods, methodSelection, (value) => `${value.methodologyPackId}@${value.methodologyPackVersion}:${value.methodId}:t${value.technologyRevision}`, this.deps.ids, 'method', context.actorUserId, at);
    let techniques = lesson.selectedTechniques;
    const newlyAdded: GovernedField<unknown>[] = methodResult.added ? [methodResult.added] : [];
    for (const technique of current.suggestedTechniques.filter((item) => requestedTechniqueIds.includes(item.id))) {
      const value: TechniqueSelection = { techniqueId: technique.id, name: technique.name, methodId: current.method.id, methodologyPackId: pack.id, methodologyPackVersion: pack.version };
      const result = appendUnique(techniques, value, (item) => `${item.methodologyPackId}@${item.methodologyPackVersion}:${item.methodId}:${item.techniqueId}`, this.deps.ids, 'technique', context.actorUserId, at);
      techniques = result.fields;
      if (result.added) newlyAdded.push(result.added);
    }
    const formValue: OrganizationalFormSelection = { formId: form.id, name: form.name, methodId: current.method.id, methodologyPackId: pack.id, methodologyPackVersion: pack.version };
    const formResult = appendUnique(lesson.selectedForms, formValue, (value) => `${value.methodologyPackId}@${value.methodologyPackVersion}:${value.methodId}:${value.formId}`, this.deps.ids, 'form', context.actorUserId, at);
    if (formResult.added) newlyAdded.push(formResult.added);

    if (newlyAdded.length === 0) {
      return { lesson, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
    }

    const saved = await this.deps.lessons.save(
      context,
      {
        ...lesson,
        selectedMethods: methodResult.fields,
        selectedTechniques: techniques,
        selectedForms: formResult.fields
      },
      { expectedVersion: input.expectedLessonVersion }
    );
    const source = methodResult.added ?? newlyAdded[0]!;
    await this.deps.invalidations.markStale(context, {
      lessonId: lesson.id,
      sourceDecisionId: source.fieldId,
      sourceRevision: source.meta.revision,
      affectedSemanticKeys: METHOD_DOWNSTREAM_KEYS
    });
    this.deps.telemetry?.increment('methodology.method.accepted',1,{methodId:current.method.id,technologyId:technology.technologyId,packId:pack.id,packVersion:pack.version});
    if(requestedTechniqueIds.length>0)this.deps.telemetry?.increment('methodology.technique.selected',requestedTechniqueIds.length,{methodId:current.method.id,packId:pack.id,packVersion:pack.version});
    return { lesson: saved, invalidations: await this.deps.invalidations.listOpen(context, lesson.id) };
  }
}

export class RejectMethodologyRecommendation {
  constructor(
    private readonly deps: {
      lessons: LessonRepository;
      feedback: MethodologyFeedbackRepository;
      clock: Clock;
      registry?: MethodologyPackRegistry;
      planning?: CoursePlanningRepository;
      telemetry?: Telemetry;
    }
  ) {}

  async execute(context: RequestContext, input: { lessonId: string; recommendationId: string }): Promise<void> {
    const lesson = await this.deps.lessons.getById(context, input.lessonId);
    if (!lesson) throw new ApplicationError('NOT_FOUND', `Lesson ${input.lessonId} was not found.`);
    const pack = resolveApprovedPack(lesson, this.deps.registry);
    const courseContext = this.deps.planning
      ? await this.deps.planning.getApprovedLessonContext(context, lesson.courseId, lesson.id)
      : null;
    const current = recommendMethodology(lesson, pack, courseContext ?? undefined).recommendations.find((item) => item.id === input.recommendationId);
    if (!current) throw new ApplicationError('DEPENDENCY_STALE', 'Methodology recommendation is stale or unknown.');
    await this.deps.feedback.reject(context, {
      lessonId: lesson.id,
      recommendationId: current.id,
      packId: pack.id,
      packVersion: pack.version,
      actorUserId: context.actorUserId,
      at: this.deps.clock.now().toISOString()
    });
    this.deps.telemetry?.increment('methodology.method.rejected',1,{methodId:current.method.id,technologyId:current.technology.id,packId:pack.id,packVersion:pack.version});
  }
}
