export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface GenerateOptions {
  system: string;
  prompt: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  responseSchemaName?: string;
  responseSchema?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

export interface GeneratedText {
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costMicrounits?: number;
  requestId?: string;
}

export interface StructuredGeneration<T> {
  value: T;
  generated: GeneratedText;
}

export interface AIProvider {
  readonly name: string;
  generate(options: GenerateOptions): Promise<GeneratedText>;
  generateStructured<T>(options: GenerateOptions): Promise<T>;
  generateStructuredResult<T>(options: GenerateOptions): Promise<StructuredGeneration<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

export type GenerationTask =
  | 'REFORMULATE'
  | 'VARIANTS'
  | 'METHODOLOGY_RECOMMENDATION'
  | 'CONTENT_DESIGN'
  | 'SCENARIO_DESIGN'
  | 'MATERIAL_GENERATION'
  | 'FINAL_REVIEW';

export interface ModelRoute {
  task: GenerationTask;
  provider: string;
  model: string;
  reasoningEffort: ReasoningEffort;
}

export interface AIRouter {
  route(task: GenerationTask): ModelRoute;
}

export * from './lesson-decision-proposal-generator.js';
export * from './openai-compatible-provider.js';
export * from './provider-errors.js';
export * from './provider-presets.js';
export * from './routing.js';
