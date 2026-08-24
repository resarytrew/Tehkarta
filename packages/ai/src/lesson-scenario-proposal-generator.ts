import { createHash } from 'node:crypto';
import {
  ApplicationError,
  type ApprovedScenarioContext,
  type LessonScenarioProposal,
  type LessonScenarioProposalGenerator,
  type ScenarioCandidate,
  type ScenarioProposalGenerationResult
} from '@tehkarta/application';
import type {
  AIProviderResolver,
  AIRouter,
  GeneratedText,
  ModelRoute
} from './index.js';
import { AIProviderError } from './provider-errors.js';

interface RawScenarioStage {
  id: string;
  title: string;
  minutes: number;
  teacherAction: string;
  studentAction: string;
  method?: string;
  techniques: string[];
  form?: string;
  evidenceOfLearning?: string;
  contentRefs: Array<{ kind: 'RP_REQUIREMENT' | 'UMK_MAPPING'; id: string }>;
}

interface RawScenarioCandidate {
  title: string;
  rationale: string;
  stages: RawScenarioStage[];
}

export const LESSON_SCENARIO_PROPOSAL_PROMPT_VERSION = 'lesson-scenario-proposal-v1';

function systemPrompt(): string {
  return `Ты — AI-методист в системе совместного педагогического проектирования урока.

ЖЁСТКИЕ ПРАВИЛА:
1. AI только предлагает сценарий. Педагог остаётся единственным автором утверждённого сценария.
2. Используй только переданный APPROVED-контекст. Не восстанавливай черновики, исключённый УМК-контент или данные из предыдущих бесед.
3. Каждое обязательное требование РП должно быть операционализировано хотя бы на одном этапе и связано через contentRefs.
4. UMK_MAPPING разрешён только для материалов, которые педагог явно включил.
5. Не цитируй и не пересказывай недоступный лицензионный текст. Если текст источника не передан, используй только его разрешённые метаданные.
6. Не выдавай синтетический текст за исторический источник, цитату или содержание учебника.
7. Используй только методы, приёмы и формы, уже утверждённые педагогом и перечисленные в контексте. Не добавляй новые методические сущности скрытно.
8. Сумма времени всех этапов должна ТОЧНО равняться durationMinutes урока.
9. Избегай перегруженного сценария и искусственных одно-минутных этапов. Для урока 45 минут обычно достаточно 4–7 содержательных этапов, если контекст не требует иного.
10. Действия учителя и ученика должны быть наблюдаемыми и конкретными. Не подменяй исследование заранее сообщённым выводом.
11. Верни только структурированный ответ по схеме.`;
}

function userPrompt(input: {
  proposal: LessonScenarioProposal;
  context: ApprovedScenarioContext;
}): string {
  const teacherInstruction = input.proposal.teacherInstruction
    ? `\nДОПОЛНИТЕЛЬНОЕ УКАЗАНИЕ ПЕДАГОГА:\n${input.proposal.teacherInstruction}\n`
    : '';

  return `Спроектируй ровно ${input.proposal.candidateCountRequested} педагогически различающихся сценария урока.
${teacherInstruction}
AUTHORITATIVE APPROVED SCENARIO CONTEXT:
${JSON.stringify(input.context, null, 2)}

ТРЕБОВАНИЯ К КАЖДОМУ СЦЕНАРИЮ:
- title: короткое методическое название варианта;
- rationale: почему именно эта логика реализует утверждённую цель, проблемный вопрос, результаты и методы;
- stages: последовательность этапов урока;
- minutes каждого этапа — целое положительное число, сумма строго ${input.context.lesson.durationMinutes};
- method можно указывать только из context.methodology.methods;
- techniques — только из context.methodology.techniques; если на этапе приём не нужен, верни пустой массив;
- form можно указывать только из context.methodology.forms;
- RP_REQUIREMENT contentRefs — только id из context.content.mandatoryRp;
- UMK_MAPPING contentRefs — только mappingId из context.content.includedUmk;
- каждое обязательное требование РП должно встретиться хотя бы в одном contentRefs;
- evidenceOfLearning описывает наблюдаемый продукт/признак продвижения, если он нужен на этапе;
- не добавляй markdown внутрь полей.`;
}

function responseSchema(candidateCount: number): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        minItems: candidateCount,
        maxItems: candidateCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'rationale', 'stages'],
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 300 },
            rationale: { type: 'string', minLength: 3, maxLength: 3000 },
            stages: {
              type: 'array',
              minItems: 2,
              maxItems: 15,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'id',
                  'title',
                  'minutes',
                  'teacherAction',
                  'studentAction',
                  'techniques',
                  'contentRefs'
                ],
                properties: {
                  id: { type: 'string', minLength: 1, maxLength: 120 },
                  title: { type: 'string', minLength: 2, maxLength: 200 },
                  minutes: { type: 'integer', minimum: 1, maximum: 300 },
                  teacherAction: { type: 'string', minLength: 3, maxLength: 2000 },
                  studentAction: { type: 'string', minLength: 3, maxLength: 2000 },
                  method: { type: 'string', maxLength: 300 },
                  techniques: {
                    type: 'array',
                    maxItems: 10,
                    items: { type: 'string', minLength: 1, maxLength: 300 }
                  },
                  form: { type: 'string', maxLength: 300 },
                  evidenceOfLearning: { type: 'string', maxLength: 1500 },
                  contentRefs: {
                    type: 'array',
                    maxItems: 50,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['kind', 'id'],
                      properties: {
                        kind: { type: 'string', enum: ['RP_REQUIREMENT', 'UMK_MAPPING'] },
                        id: { type: 'string', minLength: 1, maxLength: 300 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function parseResponse(value: unknown, expectedCount: number): RawScenarioCandidate[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Scenario structured response must be an object.');
  }
  const rawCandidates = (value as Record<string, unknown>).candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== expectedCount) {
    throw new Error(`Scenario response must contain exactly ${expectedCount} candidates.`);
  }

  return rawCandidates.map((rawCandidate, candidateIndex) => {
    if (!rawCandidate || typeof rawCandidate !== 'object' || Array.isArray(rawCandidate)) {
      throw new Error(`Scenario candidate ${candidateIndex + 1} must be an object.`);
    }
    const candidate = rawCandidate as Record<string, unknown>;
    if (
      typeof candidate.title !== 'string' ||
      typeof candidate.rationale !== 'string' ||
      !Array.isArray(candidate.stages)
    ) {
      throw new Error(`Scenario candidate ${candidateIndex + 1} is missing required fields.`);
    }

    const stages: RawScenarioStage[] = candidate.stages.map((rawStage, stageIndex) => {
      if (!rawStage || typeof rawStage !== 'object' || Array.isArray(rawStage)) {
        throw new Error(`Scenario stage ${stageIndex + 1} must be an object.`);
      }
      const stage = rawStage as Record<string, unknown>;
      if (
        typeof stage.id !== 'string' ||
        typeof stage.title !== 'string' ||
        typeof stage.minutes !== 'number' ||
        typeof stage.teacherAction !== 'string' ||
        typeof stage.studentAction !== 'string' ||
        !Array.isArray(stage.techniques) ||
        !stage.techniques.every((item) => typeof item === 'string') ||
        !Array.isArray(stage.contentRefs)
      ) {
        throw new Error(`Scenario stage ${stageIndex + 1} is missing required fields.`);
      }

      const contentRefs: RawScenarioStage['contentRefs'] = stage.contentRefs.map((rawRef) => {
        if (!rawRef || typeof rawRef !== 'object' || Array.isArray(rawRef)) {
          throw new Error(`Scenario stage ${stageIndex + 1} has an invalid content reference.`);
        }
        const ref = rawRef as Record<string, unknown>;
        if (
          (ref.kind !== 'RP_REQUIREMENT' && ref.kind !== 'UMK_MAPPING') ||
          typeof ref.id !== 'string'
        ) {
          throw new Error(`Scenario stage ${stageIndex + 1} has an invalid content reference.`);
        }
        const kind: 'RP_REQUIREMENT' | 'UMK_MAPPING' = ref.kind;
        return { kind, id: ref.id };
      });

      const parsed: RawScenarioStage = {
        id: stage.id,
        title: stage.title,
        minutes: stage.minutes,
        teacherAction: stage.teacherAction,
        studentAction: stage.studentAction,
        techniques: [...stage.techniques] as string[],
        contentRefs
      };
      if (typeof stage.method === 'string') parsed.method = stage.method;
      if (typeof stage.form === 'string') parsed.form = stage.form;
      if (typeof stage.evidenceOfLearning === 'string') {
        parsed.evidenceOfLearning = stage.evidenceOfLearning;
      }
      return parsed;
    });

    return {
      title: candidate.title,
      rationale: candidate.rationale,
      stages
    };
  });
}

function inputHash(input: {
  route: ModelRoute;
  system: string;
  prompt: string;
  schema: Readonly<Record<string, unknown>>;
  routingPolicyVersion: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        task: 'SCENARIO_DESIGN',
        provider: input.route.provider,
        model: input.route.model,
        reasoningEffort: input.route.reasoningEffort,
        promptVersion: LESSON_SCENARIO_PROPOSAL_PROMPT_VERSION,
        routingPolicyVersion: input.routingPolicyVersion,
        system: input.system,
        prompt: input.prompt,
        schema: input.schema
      })
    )
    .digest('hex');
}

function traceDetails(input: {
  route: ModelRoute;
  inputHash: string;
  routingPolicyVersion: string;
  generated?: GeneratedText;
  providerError?: AIProviderError;
  retryable: boolean;
  errorClass: string;
}): Readonly<Record<string, unknown>> {
  const latencyMs = input.generated?.latencyMs ?? input.providerError?.latencyMs;
  return {
    retryable: input.retryable,
    errorClass: input.errorClass,
    taskType: 'SCENARIO_DESIGN',
    provider: input.route.provider,
    model: input.route.model,
    promptVersion: LESSON_SCENARIO_PROPOSAL_PROMPT_VERSION,
    routingPolicyVersion: input.routingPolicyVersion,
    inputHash: input.inputHash,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(input.generated?.inputTokens !== undefined ? { inputTokens: input.generated.inputTokens } : {}),
    ...(input.generated?.outputTokens !== undefined ? { outputTokens: input.generated.outputTokens } : {}),
    ...(input.generated?.costMicrounits !== undefined ? { costMicrounits: input.generated.costMicrounits } : {}),
    ...(input.generated?.requestId ? { providerRequestId: input.generated.requestId } : {}),
    ...(input.providerError?.requestId ? { providerRequestId: input.providerError.requestId } : {}),
    ...(input.providerError?.statusCode !== undefined ? { statusCode: input.providerError.statusCode } : {}),
    ...(input.providerError?.retryAfterMs !== undefined ? { retryAfterMs: input.providerError.retryAfterMs } : {})
  };
}

export class RoutedLessonScenarioProposalGenerator implements LessonScenarioProposalGenerator {
  constructor(
    private readonly router: AIRouter,
    private readonly providers: AIProviderResolver,
    private readonly routingPolicyVersion = 'routing-v1'
  ) {}

  async generate(input: {
    proposal: LessonScenarioProposal;
    context: ApprovedScenarioContext;
  }): Promise<ScenarioProposalGenerationResult> {
    const route = this.router.route('SCENARIO_DESIGN');
    const provider = this.providers.resolve(route);
    const system = systemPrompt();
    const prompt = userPrompt(input);
    const schema = responseSchema(input.proposal.candidateCountRequested);
    const hash = inputHash({ route, system, prompt, schema, routingPolicyVersion: this.routingPolicyVersion });

    let generated: GeneratedText | undefined;
    let raw: unknown;
    try {
      const result = await provider.generateStructuredResult<unknown>({
        system,
        prompt,
        reasoningEffort: route.reasoningEffort,
        temperature: 0.45,
        responseSchemaName: 'lesson_scenario_proposal_v1',
        responseSchema: schema
      });
      generated = result.generated;
      raw = result.value;
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw new ApplicationError(
          'EXTERNAL_SERVICE_FAILED',
          `AI provider ${route.provider}/${route.model} failed during scenario design (${error.errorClass}).`,
          traceDetails({
            route,
            inputHash: hash,
            routingPolicyVersion: this.routingPolicyVersion,
            providerError: error,
            retryable: error.retryable,
            errorClass: error.errorClass
          })
        );
      }
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI provider ${route.provider}/${route.model} returned an unexpected scenario-generation failure.`,
        traceDetails({
          route,
          inputHash: hash,
          routingPolicyVersion: this.routingPolicyVersion,
          retryable: false,
          errorClass: 'UNKNOWN'
        })
      );
    }

    let parsed: RawScenarioCandidate[];
    try {
      parsed = parseResponse(raw, input.proposal.candidateCountRequested);
    } catch {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI provider ${route.provider}/${route.model} returned output that violates the scenario schema.`,
        traceDetails({
          route,
          inputHash: hash,
          routingPolicyVersion: this.routingPolicyVersion,
          generated,
          retryable: false,
          errorClass: 'INVALID_RESPONSE'
        })
      );
    }

    const candidates: ScenarioCandidate[] = parsed.map((candidate, index) => ({
      id: `scenario-candidate-${index + 1}`,
      title: candidate.title,
      rationale: candidate.rationale,
      stages: candidate.stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        minutes: stage.minutes,
        teacherAction: stage.teacherAction,
        studentAction: stage.studentAction,
        ...(stage.method ? { method: stage.method } : {}),
        techniques: stage.techniques,
        ...(stage.form ? { form: stage.form } : {}),
        ...(stage.evidenceOfLearning ? { evidenceOfLearning: stage.evidenceOfLearning } : {}),
        contentRefs: stage.contentRefs
      }))
    }));

    return {
      candidates,
      taskType: 'SCENARIO_DESIGN',
      provider: provider.name,
      model: route.model,
      promptVersion: LESSON_SCENARIO_PROPOSAL_PROMPT_VERSION,
      routingPolicyVersion: this.routingPolicyVersion,
      inputHash: hash,
      ...(generated.latencyMs !== undefined ? { latencyMs: generated.latencyMs } : {}),
      ...(generated.inputTokens !== undefined ? { inputTokens: generated.inputTokens } : {}),
      ...(generated.outputTokens !== undefined ? { outputTokens: generated.outputTokens } : {}),
      ...(generated.costMicrounits !== undefined ? { costMicrounits: generated.costMicrounits } : {}),
      ...(generated.requestId ? { providerRequestId: generated.requestId } : {})
    };
  }
}
