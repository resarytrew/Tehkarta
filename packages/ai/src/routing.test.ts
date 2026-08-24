import assert from 'node:assert/strict';
import test from 'node:test';
import type { AIProvider, GenerateOptions, GeneratedText, StructuredGeneration } from './index.js';
import { ConfiguredAIRouter, RoutedProviderRegistry } from './routing.js';

class StubProvider implements AIProvider {
  readonly name = 'stub';
  async generate(_options: GenerateOptions): Promise<GeneratedText> {
    throw new Error('not used');
  }
  async generateStructured<T>(_options: GenerateOptions): Promise<T> {
    throw new Error('not used');
  }
  async generateStructuredResult<T>(_options: GenerateOptions): Promise<StructuredGeneration<T>> {
    throw new Error('not used');
  }
  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }
}

test('router fails closed when a task has no explicit route', () => {
  const router = new ConfiguredAIRouter([
    {
      task: 'VARIANTS',
      provider: 'yandex',
      model: 'gpt://folder/model/latest',
      reasoningEffort: 'medium'
    }
  ]);
  assert.throws(() => router.route('REFORMULATE'), /No AI model route is configured/);
});

test('provider registry fails closed instead of silently falling back to another model', () => {
  const registry = new RoutedProviderRegistry([
    { provider: 'yandex', model: 'gpt://folder/model/latest', client: new StubProvider() }
  ]);

  assert.throws(
    () =>
      registry.resolve({
        task: 'VARIANTS',
        provider: 'openrouter',
        model: 'vendor/model',
        reasoningEffort: 'medium'
      }),
    /No AI provider client is registered/
  );
});
