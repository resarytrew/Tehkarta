import { OpenAICompatibleChatProvider } from './openai-compatible-provider.js';

export const YANDEX_AI_OPENAI_BASE_URL = 'https://ai.api.cloud.yandex.net/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface YandexAIStudioProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
  embeddingModel?: string;
}

export function createYandexAIStudioProvider(
  config: YandexAIStudioProviderConfig
): OpenAICompatibleChatProvider {
  return new OpenAICompatibleChatProvider({
    name: 'yandex',
    baseUrl: config.baseUrl ?? YANDEX_AI_OPENAI_BASE_URL,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {})
  });
}

export interface OpenRouterProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
  embeddingModel?: string;
  httpReferer?: string;
  appTitle?: string;
}

export function createOpenRouterProvider(
  config: OpenRouterProviderConfig
): OpenAICompatibleChatProvider {
  const extraHeaders: Record<string, string> = {};
  if (config.httpReferer?.trim()) extraHeaders['HTTP-Referer'] = config.httpReferer.trim();
  if (config.appTitle?.trim()) extraHeaders['X-Title'] = config.appTitle.trim();

  return new OpenAICompatibleChatProvider({
    name: 'openrouter',
    baseUrl: config.baseUrl ?? OPENROUTER_BASE_URL,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {}),
    ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {})
  });
}
