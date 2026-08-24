import { createHash } from 'node:crypto';
import {
  ApplicationError,
  type AiProposalAction,
  type ApprovedProposalGenerationContext,
  type LessonDecisionProposalGenerator,
  type LessonAiProposal,
  type ProposalGenerationResult
} from '@tehkarta/application';
import type {
  AIProvider,
  AIRouter,
  GeneratedText,
  GenerationTask,
  ModelRoute
} from './index.js';
import { AIProviderError } from './provider-errors.js';

export interface AIProviderResolver {
  resolve(route: ModelRoute): AIProvider;
}

interface RawCandidate {
  value: string;
  rationale: string;
  distinction?: string;
}

export const LESSON_DECISION_PROPOSAL_PROMPT_VERSION = 'lesson-decision-proposal-v2-governed-pedagogy';

function taskForAction(action: AiProposalAction): GenerationTask {
  return action === 'VARIANTS' ? 'VARIANTS' : 'REFORMULATE';
}

function actionInstruction(proposal: LessonAiProposal, targetValue?: string): string {
  switch (proposal.action) {
    case 'VARIANTS':
      return [
        `Предложи ровно ${proposal.candidateCountRequested} педагогически различающихся вариантов.`,
        'Варианты должны различаться не косметически, а по смысловому акценту или формулировочному подходу.',
        targetValue ? `Текущая формулировка поля: ${targetValue}` : 'Поле пока не заполнено педагогом.'
      ].join('\n');
    case 'REGENERATE':
      return [
        'Сформулируй новую версию поля с нуля в рамках утверждённого контекста урока.',
        'Не копируй исходную формулировку механически.',
        targetValue ? `Текущая формулировка для ориентира: ${targetValue}` : ''
      ].filter(Boolean).join('\n');
    case 'IMPROVE':
      return [
        'Улучши формулировку педагога, сохранив её исходный смысл и педагогическое намерение.',
        'Не подменяй замысел педагога новым замыслом.',
        `Исходная формулировка: ${targetValue ?? ''}`
      ].join('\n');
  }
}

function semanticFieldInstruction(semanticKey: LessonAiProposal['semanticKey']): string {
  switch (semanticKey) {
    case 'goal':
      return 'Поле: цель урока. Формулировка должна описывать ожидаемое изменение в понимании и деятельности ученика.';
    case 'problemQuestion':
      return 'Поле: проблемный вопрос. Он должен запускать интеллектуальный поиск и быть связан с причинно-следственным или содержательным ядром урока.';
    case 'bigIdea':
      return 'Поле: большая идея. Это смысловой вывод урока, а не перечень фактов или учебных действий.';
  }
}

function systemPrompt(): string {
  return `Ты — AI-методист в системе совместного проектирования урока.

ЖЁСТКИЕ ПРАВИЛА:
1. AI только предлагает. Педагог принимает решение.
2. Утверждённые педагогом данные ниже являются ограничениями, а не материалом для переписывания.
3. Не добавляй факты об УМК, которых нет в переданном контексте.
4. Не выдавай синтетический текст за исторический источник, цитату или содержание учебника.
5. Не меняй выбранную педагогом технологию, методы, формы или содержание.
6. Если контекста мало, сформулируй аккуратное предложение в пределах имеющихся данных — не выдумывай отсутствующий контекст.
7. Верни только структурированный ответ по требуемой схеме.`;
}

function userPrompt(input: {
  proposal: LessonAiProposal;
  targetValue?: string;
  context: ApprovedProposalGenerationContext;
}): string {
  const teacherInstruction = input.proposal.teacherInstruction
    ? `\nДОПОЛНИТЕЛЬНОЕ УКАЗАНИЕ ПЕДАГОГА:\n${input.proposal.teacherInstruction}\n`
    : '';

  return `${semanticFieldInstruction(input.proposal.semanticKey)}

ДЕЙСТВИЕ:
${actionInstruction(input.proposal, input.targetValue)}
${teacherInstruction}
УТВЕРЖДЁННЫЙ КОНТЕКСТ УРОКА:
${JSON.stringify(input.context, null, 2)}

ТРЕБОВАНИЯ К ОТВЕТУ:
- candidates: массив ровно из ${input.proposal.candidateCountRequested} элементов;
- value: готовая формулировка поля;
- rationale: краткое объяснение, почему вариант подходит именно этому уроку;
- distinction: для нескольких вариантов кратко укажи, чем вариант отличается от остальных; для одного варианта поле можно опустить;
- не добавляй markdown, нумерацию или служебные комментарии внутрь value.`;
}

function proposalResponseSchema(candidateCount: number): Readonly<Record<string, unknown>> {
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
          required: ['value', 'rationale'],
          properties: {
            value: { type: 'string', minLength: 3, maxLength: 4_000 },
            rationale: { type: 'string', minLength: 3, maxLength: 2_000 },
            distinction: { type: 'string', maxLength: 1_000 }
          }
        }
      }
    }
  };
}

function parseResponse(value: unknown, expectedCount: number): RawCandidate[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI structured response must be an object.');
  }
  const rawCandidates = (value as Record<string, unknown>).candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== expectedCount) {
    throw new Error(`AI structured response must contain exactly ${expectedCount} candidates.`);
  }

  return rawCandidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`AI candidate ${index + 1} must be an object.`);
    }
    const item = candidate as Record<string, unknown>;
    if (typeof item.value !== 'string' || typeof item.rationale !== 'string') {
      throw new Error(`AI candidate ${index + 1} must contain string value and rationale.`);
    }
    if (item.distinction !== undefined && typeof item.distinction !== 'string') {
      throw new Error(`AI candidate ${index + 1} distinction must be a string when present.`);
    }
    return {
      value: item.value,
      rationale: item.rationale,
      ...(typeof item.distinction === 'string' ? { distinction: item.distinction } : {})
    };
  });
}

function promptInputHash(input: {
  task: GenerationTask;
  route: ModelRoute;
  system: string;
  prompt: string;
  schema: Readonly<Record<string, unknown>>;
  routingPolicyVersion: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        task: input.task,
        provider: input.route.provider,
        model: input.route.model,
        reasoningEffort: input.route.reasoningEffort,
        promptVersion: LESSON_DECISION_PROPOSAL_PROMPT_VERSION,
        routingPolicyVersion: input.routingPolicyVersion,
        system: input.system,
        prompt: input.prompt,
        schema: input.schema
      })
    )
    .digest('hex');
}

function traceDetails(input: {
  task: GenerationTask;
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
    taskType: input.task,
    provider: input.route.provider,
    model: input.route.model,
    promptVersion: LESSON_DECISION_PROPOSAL_PROMPT_VERSION,
    routingPolicyVersion: input.routingPolicyVersion,
    inputHash: input.inputHash,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(input.generated?.inputTokens !== undefined
      ? { inputTokens: input.generated.inputTokens }
      : {}),
    ...(input.generated?.outputTokens !== undefined
      ? { outputTokens: input.generated.outputTokens }
      : {}),
    ...(input.generated?.costMicrounits !== undefined
      ? { costMicrounits: input.generated.costMicrounits }
      : {}),
    ...(input.generated?.requestId ? { providerRequestId: input.generated.requestId } : {}),
    ...(input.providerError?.requestId
      ? { providerRequestId: input.providerError.requestId }
      : {}),
    ...(input.providerError?.statusCode !== undefined
      ? { statusCode: input.providerError.statusCode }
      : {}),
    ...(input.providerError?.retryAfterMs !== undefined
      ? { retryAfterMs: input.providerError.retryAfterMs }
      : {})
  };
}

export class RoutedLessonDecisionProposalGenerator implements LessonDecisionProposalGenerator {
  constructor(
    private readonly router: AIRouter,
    private readonly providers: AIProviderResolver,
    private readonly routingPolicyVersion = 'routing-v1'
  ) {}

  async generate(input: {
    proposal: LessonAiProposal;
    targetValue?: string;
    context: ApprovedProposalGenerationContext;
  }): Promise<ProposalGenerationResult> {
    const task = taskForAction(input.proposal.action);
    const route = this.router.route(task);
    const provider = this.providers.resolve(route);
    const system = systemPrompt();
    const prompt = userPrompt(input);
    const responseSchema = proposalResponseSchema(input.proposal.candidateCountRequested);
    const inputHash = promptInputHash({
      task,
      route,
      system,
      prompt,
      schema: responseSchema,
      routingPolicyVersion: this.routingPolicyVersion
    });

    let generated: GeneratedText | undefined;
    let raw: unknown;
    try {
      const result = await provider.generateStructuredResult<unknown>({
        system,
        prompt,
        reasoningEffort: route.reasoningEffort,
        temperature: input.proposal.action === 'VARIANTS' ? 0.6 : 0.35,
        responseSchemaName: 'lesson_decision_proposal_v1',
        responseSchema
      });
      generated = result.generated;
      raw = result.value;
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw new ApplicationError(
          'EXTERNAL_SERVICE_FAILED',
          `AI provider ${route.provider}/${route.model} failed (${error.errorClass}).`,
          traceDetails({
            task,
            route,
            inputHash,
            routingPolicyVersion: this.routingPolicyVersion,
            providerError: error,
            retryable: error.retryable,
            errorClass: error.errorClass
          })
        );
      }
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI provider ${route.provider}/${route.model} returned an unexpected failure.`,
        traceDetails({
          task,
          route,
          inputHash,
          routingPolicyVersion: this.routingPolicyVersion,
          retryable: false,
          errorClass: 'UNKNOWN'
        })
      );
    }

    let parsed: RawCandidate[];
    try {
      parsed = parseResponse(raw, input.proposal.candidateCountRequested);
    } catch {
      throw new ApplicationError(
        'EXTERNAL_SERVICE_FAILED',
        `AI provider ${route.provider}/${route.model} returned output that violates the proposal schema.`,
        traceDetails({
          task,
          route,
          inputHash,
          routingPolicyVersion: this.routingPolicyVersion,
          generated,
          retryable: false,
          errorClass: 'INVALID_RESPONSE'
        })
      );
    }

    return {
      candidates: parsed.map((candidate, index) => ({
        id: `candidate-${index + 1}`,
        value: candidate.value,
        rationale: candidate.rationale,
        ...(candidate.distinction ? { distinction: candidate.distinction } : {})
      })),
      taskType: task,
      provider: provider.name,
      model: route.model,
      promptVersion: LESSON_DECISION_PROPOSAL_PROMPT_VERSION,
      routingPolicyVersion: this.routingPolicyVersion,
      inputHash,
      ...(generated.latencyMs !== undefined ? { latencyMs: generated.latencyMs } : {}),
      ...(generated.inputTokens !== undefined ? { inputTokens: generated.inputTokens } : {}),
      ...(generated.outputTokens !== undefined ? { outputTokens: generated.outputTokens } : {}),
      ...(generated.costMicrounits !== undefined
        ? { costMicrounits: generated.costMicrounits }
        : {}),
      ...(generated.requestId ? { providerRequestId: generated.requestId } : {})
    };
  }
}
