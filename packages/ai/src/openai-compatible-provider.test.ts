import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleChatProvider } from './openai-compatible-provider.js';
import { AIProviderError } from './provider-errors.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('429 is retryable and remote body is not exposed in the error', async () => {
  globalThis.fetch = async () =>
    new Response('secret echoed prompt should never escape', {
      status: 429,
      headers: { 'retry-after': '3', 'x-request-id': 'req-rate-limit' }
    });

  const provider = new OpenAICompatibleChatProvider({
    name: 'openrouter',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test/model'
  });

  await assert.rejects(
    provider.generate({ system: 'system', prompt: 'prompt' }),
    (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.errorClass, 'RATE_LIMIT');
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterMs, 3_000);
      assert.equal(error.requestId, 'req-rate-limit');
      assert.doesNotMatch(error.message, /secret echoed prompt/);
      return true;
    }
  );
});

test('structured generation preserves usage and cost metadata', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 123, completion_tokens: 45, cost: 0.00125 }
      }),
      { status: 200, headers: { 'x-request-id': 'req-success' } }
    );

  const provider = new OpenAICompatibleChatProvider({
    name: 'openrouter',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test/model'
  });
  const result = await provider.generateStructuredResult<{ ok: boolean }>({
    system: 'system',
    prompt: 'prompt',
    responseSchemaName: 'test',
    responseSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } }
    }
  });

  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.generated.inputTokens, 123);
  assert.equal(result.generated.outputTokens, 45);
  assert.equal(result.generated.costMicrounits, 1_250);
  assert.equal(result.generated.requestId, 'req-success');
});

test('structured generation sends reasoning effort and accepts a fenced JSON object', async () => {
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] }),
      { status: 200 }
    );
  };

  const provider = new OpenAICompatibleChatProvider({
    name: 'openrouter',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test/model',
    structuredOutputMode: 'json-object'
  });
  const result = await provider.generateStructuredResult<{ ok: boolean }>({
    system: 'system',
    prompt: 'prompt',
    reasoningEffort: 'medium',
    responseSchemaName: 'test',
    responseSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } }
    }
  });

  assert.deepEqual(result.value, { ok: true });
  assert.deepEqual(requestBody?.reasoning, { effort: 'medium', exclude: true });
  assert.deepEqual(requestBody?.response_format, { type: 'json_object' });
  const messages = requestBody?.messages as Array<{ role: string; content: string }>;
  assert.match(messages[1]?.content ?? '', /Match this JSON Schema exactly/);
});

test('invalid structured JSON is terminal INVALID_RESPONSE', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), {
      status: 200
    });

  const provider = new OpenAICompatibleChatProvider({
    name: 'yandex',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'gpt://folder/model/latest'
  });

  await assert.rejects(
    provider.generateStructuredResult({
      system: 'system',
      prompt: 'prompt',
      responseSchemaName: 'test'
    }),
    (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.errorClass, 'INVALID_RESPONSE');
      assert.equal(error.retryable, false);
      return true;
    }
  );
});
