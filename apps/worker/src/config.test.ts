import assert from 'node:assert/strict';
import test from 'node:test';
import { workerConfigFromEnv } from './config.js';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    AI_VARIANTS_PROVIDER: 'yandex',
    AI_VARIANTS_MODEL: 'gpt://folder/variants/latest',
    AI_REFORMULATE_PROVIDER: 'openrouter',
    AI_REFORMULATE_MODEL: 'vendor/rewrite-model',
    AI_SCENARIO_PROVIDER: 'yandex',
    AI_SCENARIO_MODEL: 'gpt://folder/scenario/latest',
    YANDEX_AI_API_KEY: 'yandex-test-key',
    OPENROUTER_API_KEY: 'openrouter-test-key'
  };
}

test('worker config resolves explicit Yandex and OpenRouter routes without fallback', () => {
  const config = workerConfigFromEnv(baseEnv());
  assert.deepEqual(config.ai.routes.variants, {
    provider: 'yandex',
    model: 'gpt://folder/variants/latest'
  });
  assert.deepEqual(config.ai.routes.reformulate, {
    provider: 'openrouter',
    model: 'vendor/rewrite-model'
  });
  assert.deepEqual(config.ai.routes.scenario, {
    provider: 'yandex',
    model: 'gpt://folder/scenario/latest'
  });
  assert.equal(config.ai.yandex?.baseUrl, 'https://ai.api.cloud.yandex.net/v1');
  assert.equal(config.ai.openrouter?.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(config.ai.routingPolicyVersion, 'routing-v2');
});

test('unused provider credentials are not required', () => {
  const env: NodeJS.ProcessEnv = {
    AI_VARIANTS_PROVIDER: 'yandex',
    AI_VARIANTS_MODEL: 'gpt://folder/variants/latest',
    AI_REFORMULATE_PROVIDER: 'yandex',
    AI_REFORMULATE_MODEL: 'gpt://folder/rewrite/latest',
    AI_SCENARIO_PROVIDER: 'yandex',
    AI_SCENARIO_MODEL: 'gpt://folder/scenario/latest',
    YANDEX_AI_API_KEY: 'yandex-test-key'
  };
  const config = workerConfigFromEnv(env);
  assert.ok(config.ai.yandex);
  assert.equal(config.ai.openrouter, undefined);
});

test('route provider and model must be explicit', () => {
  const env = baseEnv();
  delete env.AI_VARIANTS_PROVIDER;
  assert.throws(() => workerConfigFromEnv(env), /AI_VARIANTS_PROVIDER/);

  const env2 = baseEnv();
  delete env2.AI_REFORMULATE_MODEL;
  assert.throws(() => workerConfigFromEnv(env2), /AI_REFORMULATE_MODEL/);

  const env3 = baseEnv();
  delete env3.AI_SCENARIO_MODEL;
  assert.throws(() => workerConfigFromEnv(env3), /AI_SCENARIO_MODEL/);
});
