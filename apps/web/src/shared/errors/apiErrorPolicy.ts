import { ApiRequestError } from '../api/ApiClient.js';

export type ApiErrorKind =
  | 'session-expired'
  | 'forbidden'
  | 'stale-version'
  | 'dependency-stale'
  | 'validation'
  | 'network'
  | 'server'
  | 'unknown';

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  message: string;
  recovery: 'reauthenticate' | 'reload-lesson' | 'retry' | 'none';
}

export function classifyApiError(error: unknown): ClassifiedApiError {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { kind: 'session-expired', message: 'Сессия завершена. Выполните вход ещё раз.', recovery: 'reauthenticate' };
    }
    if (error.status === 403) {
      return { kind: 'forbidden', message: error.message || 'Недостаточно прав для этой рабочей области.', recovery: 'none' };
    }
    if (error.status === 409 && error.payload.code === 'DEPENDENCY_STALE') {
      return { kind: 'dependency-stale', message: 'Рекомендация устарела после изменений урока. Загружен актуальный утверждённый контекст.', recovery: 'reload-lesson' };
    }
    if (error.status === 409) {
      return { kind: 'stale-version', message: 'Данные изменились в другой вкладке. Загружена актуальная версия.', recovery: 'reload-lesson' };
    }
    if (error.status === 400 || error.status === 422) {
      return { kind: 'validation', message: error.message, recovery: 'none' };
    }
    if (error.status >= 500) {
      return { kind: 'server', message: error.message || 'Сервис временно недоступен.', recovery: 'retry' };
    }
    return { kind: 'unknown', message: error.message, recovery: 'none' };
  }
  if (error instanceof TypeError) {
    return { kind: 'network', message: 'Не удалось связаться с сервером. Проверьте соединение.', recovery: 'retry' };
  }
  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'Произошла неизвестная ошибка.',
    recovery: 'none'
  };
}

export function errorMessage(error: unknown): string {
  return classifyApiError(error).message;
}
