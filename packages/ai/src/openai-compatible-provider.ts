import type {
  AIProvider,
  GeneratedText,
  GenerateOptions,
  StructuredGeneration
} from './index.js';
import {
  AIProviderError,
  classifyHttpProviderFailure,
  isTimeoutLikeError,
  parseRetryAfterMs
} from './provider-errors.js';

export interface OpenAICompatibleProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  timeoutMs?: number;
  maxTokens?: number;
  extraHeaders?: Readonly<Record<string, string>>;
  structuredOutputMode?: 'json-schema' | 'json-object';
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
    cost?: number;
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

function jsonSchemaResponseFormat(
  options: GenerateOptions,
  mode: 'json-schema' | 'json-object'
): unknown {
  if (options.responseSchema) {
    if (mode === 'json-object') return { type: 'json_object' };
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

function promptWithStructuredOutputInstruction(
  options: GenerateOptions,
  mode: 'json-schema' | 'json-object'
): string {
  if (mode !== 'json-object') return options.prompt;
  if (options.responseSchema) {
    return `${options.prompt}\n\nReturn exactly one valid JSON object without markdown or prose. Match this JSON Schema exactly:\n${JSON.stringify(options.responseSchema)}`;
  }
  if (options.responseSchemaName) {
    return `${options.prompt}\n\nReturn exactly one valid JSON object without markdown or prose.`;
  }
  return options.prompt;
}

function requestSignal(options: GenerateOptions, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

function structuredJsonText(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function requestId(headers: Headers): string | undefined {
  return (
    headers.get('x-request-id') ??
    headers.get('request-id') ??
    headers.get('x-yandex-request-id') ??
    undefined
  );
}

function extractText(
  response: ChatCompletionResponse,
  provider: string,
  model: string,
  latencyMs: number,
  remoteRequestId?: string
): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIProviderError('AI provider returned an empty or non-text completion.', {
      provider,
      model,
      errorClass: 'INVALID_RESPONSE',
      retryable: false,
      latencyMs,
      ...(remoteRequestId ? { requestId: remoteRequestId } : {})
    });
  }
  return content;
}

function httpFailure(
  provider: string,
  model: string,
  response: Response,
  latencyMs: number
): AIProviderError {
  const classified = classifyHttpProviderFailure(response.status);
  const remoteRequestId = requestId(response.headers);
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
  return new AIProviderError(
    `AI provider request failed with HTTP ${response.status}.`,
    {
      provider,
      model,
      errorClass: classified.errorClass,
      retryable: classified.retryable,
      statusCode: response.status,
      latencyMs,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      ...(remoteRequestId ? { requestId: remoteRequestId } : {})
    }
  );
}

function invalidJsonFailure(
  provider: string,
  model: string,
  latencyMs: number,
  remoteRequestId: string | undefined,
  cause: unknown
): AIProviderError {
  return new AIProviderError('AI provider returned malformed JSON.', {
    provider,
    model,
    errorClass: 'INVALID_RESPONSE',
    retryable: false,
    latencyMs,
    ...(remoteRequestId ? { requestId: remoteRequestId } : {}),
    cause
  });
}

function transportFailure(
  provider: string,
  model: string,
  error: unknown,
  latencyMs: number
): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (isTimeoutLikeError(error)) {
    return new AIProviderError('AI provider request timed out.', {
      provider,
      model,
      errorClass: 'TIMEOUT',
      retryable: true,
      latencyMs,
      cause: error
    });
  }
  return new AIProviderError('AI provider network request failed.', {
    provider,
    model,
    errorClass: 'NETWORK',
    retryable: true,
    latencyMs,
    cause: error
  });
}

/**
 * OpenAI-compatible HTTP adapter. Provider response bodies are never copied to
 * errors because upstream payloads may echo prompts or other sensitive input.
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

    this.name = config.name.trim().toLowerCase();
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
    requestId?: string;
  }> {
    const structuredOutputMode = this.config.structuredOutputMode ?? 'json-schema';
    const responseFormat = jsonSchemaResponseFormat(options, structuredOutputMode);
    const prompt = promptWithStructuredOutputInstruction(options, structuredOutputMode);
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: this.maxTokens,
      stream: false,
      ...(options.reasoningEffort
        ? { reasoning: { effort: options.reasoningEffort, exclude: true } }
        : {}),
      ...(responseFormat ? { response_format: responseFormat } : {})
    };

    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: requestSignal(options, this.timeoutMs)
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) throw httpFailure(this.name, this.config.model, response, latencyMs);

      const remoteRequestId = requestId(response.headers);
      let payload: ChatCompletionResponse;
      try {
        payload = (await response.json()) as ChatCompletionResponse;
      } catch (error) {
        throw invalidJsonFailure(
          this.name,
          this.config.model,
          latencyMs,
          remoteRequestId,
          error
        );
      }

      return {
        response: payload,
        latencyMs,
        ...(remoteRequestId ? { requestId: remoteRequestId } : {})
      };
    } catch (error) {
      throw transportFailure(this.name, this.config.model, error, Date.now() - started);
    }
  }

  async generate(options: GenerateOptions): Promise<GeneratedText> {
    const result = await this.chat(options);
    const text = extractText(
      result.response,
      this.name,
      this.config.model,
      result.latencyMs,
      result.requestId
    );
    const generated: GeneratedText = {
      text,
      provider: this.name,
      model: this.config.model,
      latencyMs: result.latencyMs,
      ...(result.requestId ? { requestId: result.requestId } : {})
    };
    if (typeof result.response.usage?.prompt_tokens === 'number') {
      generated.inputTokens = result.response.usage.prompt_tokens;
    }
    if (typeof result.response.usage?.completion_tokens === 'number') {
      generated.outputTokens = result.response.usage.completion_tokens;
    }
    if (
      typeof result.response.usage?.cost === 'number' &&
      Number.isFinite(result.response.usage.cost) &&
      result.response.usage.cost >= 0
    ) {
      generated.costMicrounits = Math.round(result.response.usage.cost * 1_000_000);
    }
    return generated;
  }

  async generateStructuredResult<T>(options: GenerateOptions): Promise<StructuredGeneration<T>> {
    const generated = await this.generate({
      ...options,
      responseSchemaName: options.responseSchemaName ?? 'structured_response'
    });
    try {
      return {
        value: JSON.parse(structuredJsonText(generated.text)) as T,
        generated
      };
    } catch (error) {
      throw new AIProviderError('AI provider returned invalid JSON for a structured response.', {
        provider: generated.provider,
        model: generated.model,
        errorClass: 'INVALID_RESPONSE',
        retryable: false,
        ...(generated.latencyMs !== undefined ? { latencyMs: generated.latencyMs } : {}),
        ...(generated.requestId ? { requestId: generated.requestId } : {}),
        cause: error
      });
    }
  }

  async generateStructured<T>(options: GenerateOptions): Promise<T> {
    return (await this.generateStructuredResult<T>(options)).value;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.config.embeddingModel) {
      throw new Error(`Provider ${this.name} has no embedding model configured.`);
    }
    if (texts.length === 0) return [];

    const embeddingModel = this.config.embeddingModel;
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: embeddingModel,
          input: texts
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        throw httpFailure(this.name, embeddingModel, response, latencyMs);
      }

      const remoteRequestId = requestId(response.headers);
      let payload: EmbeddingsResponse;
      try {
        payload = (await response.json()) as EmbeddingsResponse;
      } catch (error) {
        throw invalidJsonFailure(this.name, embeddingModel, latencyMs, remoteRequestId, error);
      }

      const rows = payload.data;
      if (!Array.isArray(rows) || rows.length !== texts.length) {
        throw new AIProviderError('AI embedding provider returned an unexpected vector count.', {
          provider: this.name,
          model: embeddingModel,
          errorClass: 'INVALID_RESPONSE',
          retryable: false,
          latencyMs,
          ...(remoteRequestId ? { requestId: remoteRequestId } : {})
        });
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
            throw new AIProviderError(`AI embedding ${index + 1} is not a numeric vector.`, {
              provider: this.name,
              model: embeddingModel,
              errorClass: 'INVALID_RESPONSE',
              retryable: false,
              latencyMs,
              ...(remoteRequestId ? { requestId: remoteRequestId } : {})
            });
          }
          return row.embedding as number[];
        });
    } catch (error) {
      throw transportFailure(this.name, embeddingModel, error, Date.now() - started);
    }
  }
}
