import type { AIProvider, AIRouter, GenerationTask, ModelRoute } from './index.js';
import type { AIProviderResolver } from './lesson-decision-proposal-generator.js';

export class ConfiguredAIRouter implements AIRouter {
  private readonly routes: Map<GenerationTask, ModelRoute>;

  constructor(routes: readonly ModelRoute[]) {
    this.routes = new Map(routes.map((route) => [route.task, route]));
  }

  route(task: GenerationTask): ModelRoute {
    const route = this.routes.get(task);
    if (!route) throw new Error(`No AI model route is configured for task ${task}.`);
    return route;
  }
}

/**
 * Providers are keyed by both provider and model because one vendor can expose
 * several differently configured model clients with different cost/quality
 * characteristics. The worker therefore follows routing policy explicitly.
 */
export class RoutedProviderRegistry implements AIProviderResolver {
  private readonly providers: Map<string, AIProvider>;

  constructor(entries: readonly Array<{ provider: string; model: string; client: AIProvider }>) {
    this.providers = new Map(
      entries.map((entry) => [this.key(entry.provider, entry.model), entry.client])
    );
  }

  resolve(route: ModelRoute): AIProvider {
    const provider = this.providers.get(this.key(route.provider, route.model));
    if (!provider) {
      throw new Error(
        `No AI provider client is registered for ${route.provider}/${route.model}.`
      );
    }
    return provider;
  }

  private key(provider: string, model: string): string {
    return `${provider.trim().toLowerCase()}::${model.trim()}`;
  }
}
