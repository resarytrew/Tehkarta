import type {
  AIProvider,
  GeneratedText,
  GenerateOptions
} from './index.js';

export interface OpenAICompatibleProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  timeoutMs?: number;
  maxTokens?: number;
  extraHeaders?: Readonly<Record<string, string>>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface EmbeddingsResponse {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
}

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback;
}

function jsonSchemaResponseFormat(options: GenerateOptions): unknown {
  if (options.responseSchema) {
    return {
      type: 'json_schema',
      json_schema: {
        name: options.responseSchemaName ?? 'structured_response',
        strict: true,
        schema: options.responseSchema
      }
    };
  }
  if (options.responseSchemaName) {
    return { type: 'json_object' };
  }
  return undefined;
}

function extractText(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI provider returned an empty or non-text completion.');
  }
  return content;
}

function safeRemoteError(status: number, body: string): Error {
  const compact = body.replace(/\s+/g, ' ').trim().slice(0, 500);
  return new Error(
    `AI provider request failed with HTTP ${status}${compact ? `: ${compact}` : ''}`
  );
}

/**
 * Minimal OpenAI-compatible adapter with no SDK dependency. It works with
 * providers exposing `/v1/chat/completions` semantics, including Yandex Cloud
 * AI Studio's OpenAI-compatible endpoint. Secrets never enter logs here.
 */
export class OpenAICompatibleChatProvider implements AIProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(private readonly config: OpenAICompatibleProviderConfig) {
    if (!config.name.trim()) throw new Error('AI provider name is required.');
    if (!config.baseUrl.trim()) throw new Error('AI provider baseUrl is required.');
    if (!config.apiKey.trim()) throw new Error('AI provider apiKey is required.');
    if (!config.model.trim()) throw new Error('AI provider model is required.');

    this.name = config.name.trim();
    this.baseUrl = cleanBaseUrl(config.baseUrl);
    this.timeoutMs = positiveNumber(config.timeoutMs, 90_000);
    this.maxTokens = positiveNumber(config.maxTokens, 2_000);
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.config.extraHeaders ?? {})
    };
  }

  private async chat(options: GenerateOptions): Promise<{
    response: ChatCompletionResponse;
    latencyMs: number;
  }> {
    const responseFormat = jsonSchemaResponseFormat(options);
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.prompt }
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: this.maxTokens,
      stream: false,
      ...(responseFormat ? { response_format: responseFormat } : {})
    };

    const started = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      throw safeRemoteError(response.status, await response.text());
    }

    return {
      response: (await response.json()) as ChatCompletionResponse,
      latencyMs
    };
  }

  async generate(options: GenerateOptions): Promise<GeneratedText> {
    const result = await this.chat(options);
    const generated: GeneratedText = {
      text: extractText(result.response),
      provider: this.name,
      model: this.config.model,
      latencyMs: result.latencyMs
    };
    if (typeof result.response.usage?.prompt_tokens === 'number') {
      generated.inputTokens = result.response.usage.prompt_tokens;
    }
    if (typeof result.response.usage?.completion_tokens === 'number') {
      generated.outputTokens = result.response.usage.completion_tokens;
    }
    return generated;
  }

  async generateStructured<T>(options: GenerateOptions): Promise<T> {
    const generated = await this.generate({
      ...options,
      responseSchemaName: options.responseSchemaName ?? 'structured_response'
    });
    try {
      return JSON.parse(generated.text) as T;
    } catch {
      throw new Error('AI provider returned invalid JSON for a structured response.');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.config.embeddingModel) {
      throw new Error(`Provider ${this.name} has no embedding model configured.`);
    }
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: texts
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw safeRemoteError(response.status, await response.text());
    }

    const payload = (await response.json()) as EmbeddingsResponse;
    const rows = payload.data;
    if (!Array.isArray(rows) || rows.length !== texts.length) {
      throw new Error('AI embedding provider returned an unexpected number of vectors.');
    }

    return rows
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row, index) => {
        if (
          !Array.isArray(row.embedding) ||
          row.embedding.length === 0 ||
          !row.embedding.every((item) => typeof item === 'number' && Number.isFinite(item))
        ) {
          throw new Error(`AI embedding ${index + 1} is not a numeric vector.`);
        }
        return row.embedding as number[];
      });
  }
}
