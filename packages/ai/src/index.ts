export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface GenerateOptions {
  system: string;
  prompt: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  responseSchemaName?: string;
}

export interface GeneratedText {
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface AIProvider {
  readonly name: string;
  generate(options: GenerateOptions): Promise<GeneratedText>;
  generateStructured<T>(options: GenerateOptions): Promise<T>;
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
