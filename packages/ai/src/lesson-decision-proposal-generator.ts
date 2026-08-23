import type {
  AiProposalAction,
  ApprovedProposalGenerationContext,
  LessonDecisionProposalGenerator,
  LessonAiProposal,
  ProposalGenerationResult
} from '@tehkarta/application';
import type { AIProvider, AIRouter, GenerationTask, ModelRoute } from './index.js';

export interface AIProviderResolver {
  resolve(route: ModelRoute): AIProvider;
}

interface RawCandidate {
  value: string;
  rationale: string;
  distinction?: string;
}

interface RawProposalResponse {
  candidates: RawCandidate[];
}

const PROMPT_VERSION = 'lesson-decision-proposal-v1';

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
    const route = this.router.route(taskForAction(input.proposal.action));
    const provider = this.providers.resolve(route);
    const raw = await provider.generateStructured<unknown>({
      system: systemPrompt(),
      prompt: userPrompt(input),
      reasoningEffort: route.reasoningEffort,
      temperature: input.proposal.action === 'VARIANTS' ? 0.6 : 0.35,
      responseSchemaName: 'lesson_decision_proposal_v1'
    });
    const parsed = parseResponse(raw, input.proposal.candidateCountRequested);

    return {
      candidates: parsed.map((candidate, index) => ({
        id: `candidate-${index + 1}`,
        value: candidate.value,
        rationale: candidate.rationale,
        ...(candidate.distinction ? { distinction: candidate.distinction } : {})
      })),
      provider: provider.name,
      model: route.model,
      promptVersion: PROMPT_VERSION,
      routingPolicyVersion: this.routingPolicyVersion
    };
  }
}
