import { useEffect, useMemo, useState } from 'react';
import { TehkartaApiClient } from '../api.js';
import type { LessonAiProposal } from '../types.js';
import './AiProposalPanel.css';

interface AiProposalPanelProps {
  proposal: LessonAiProposal;
}

const TERMINAL_STATUSES = new Set<LessonAiProposal['status']>([
  'READY',
  'APPLIED',
  'DISMISSED',
  'STALE',
  'FAILED',
  'CANCELLED'
]);

const statusLabel: Record<LessonAiProposal['status'], string> = {
  QUEUED: 'В очереди',
  RUNNING: 'AI готовит варианты',
  READY: 'Варианты готовы',
  APPLIED: 'Применено педагогом',
  DISMISSED: 'Отклонено педагогом',
  STALE: 'Устарело',
  FAILED: 'Ошибка генерации',
  CANCELLED: 'Отменено'
};

const actionLabel: Record<LessonAiProposal['action'], string> = {
  VARIANTS: 'Альтернативные варианты',
  REGENERATE: 'Новая формулировка',
  IMPROVE: 'Улучшение формулировки'
};

function errorText(proposal: LessonAiProposal): string | null {
  const message = proposal.error?.message;
  return typeof message === 'string' && message.trim() ? message : null;
}

export function AiProposalPanel({ proposal }: AiProposalPanelProps) {
  const [currentProposal, setCurrentProposal] = useState(proposal);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  const api = useMemo(
    () =>
      new TehkartaApiClient({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
        workspaceId: proposal.workspaceId
      }),
    [proposal.workspaceId]
  );

  useEffect(() => {
    setCurrentProposal(proposal);
    setSelectedCandidateId(null);
    setPollingError(null);
  }, [proposal.id]);

  useEffect(() => {
    if (new Date(proposal.updatedAt).getTime() > new Date(currentProposal.updatedAt).getTime()) {
      setCurrentProposal(proposal);
    }
  }, [proposal, currentProposal.updatedAt]);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(currentProposal.status)) return;

    let cancelled = false;
    let timer: number | undefined;
    let delayMs = 1_200;

    const poll = async () => {
      try {
        const refreshed = await api.getAiProposal(
          currentProposal.lessonId,
          currentProposal.id
        );
        if (cancelled) return;
        setCurrentProposal(refreshed);
        setPollingError(null);
        if (TERMINAL_STATUSES.has(refreshed.status)) return;
        delayMs = Math.min(Math.round(delayMs * 1.6), 5_000);
      } catch (error) {
        if (cancelled) return;
        setPollingError(
          error instanceof Error
            ? error.message
            : 'Не удалось обновить статус AI-предложения.'
        );
        delayMs = Math.min(Math.round(delayMs * 2), 8_000);
      }

      timer = window.setTimeout(() => void poll(), delayMs);
    };

    timer = window.setTimeout(() => void poll(), delayMs);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [api, currentProposal.id, currentProposal.lessonId, currentProposal.status]);

  const selectedCandidate = useMemo(
    () =>
      currentProposal.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [currentProposal.candidates, selectedCandidateId]
  );

  const isPending = currentProposal.status === 'QUEUED' || currentProposal.status === 'RUNNING';
  const failure = errorText(currentProposal);

  return (
    <section
      className={`ai-proposal-panel ai-proposal-panel--${currentProposal.status.toLowerCase()}`}
      aria-live="polite"
    >
      <div className="ai-proposal-panel__header">
        <div>
          <span className="ai-proposal-panel__eyebrow">
            AI-предложение · отдельно от решения педагога
          </span>
          <h4>{actionLabel[currentProposal.action]}</h4>
        </div>
        <span className="ai-proposal-panel__status">{statusLabel[currentProposal.status]}</span>
      </div>

      {isPending ? (
        <div className="ai-proposal-progress">
          <span className="ai-proposal-progress__dot" aria-hidden="true" />
          <div>
            <strong>
              {currentProposal.status === 'QUEUED' ? 'Запрос принят' : 'Идёт генерация'}
            </strong>
            <p>
              Утверждённый текст урока не меняется. Статус обновляется автоматически с ограниченным backoff.
            </p>
            {pollingError ? (
              <p className="ai-proposal-progress__error">
                Временная ошибка обновления: {pollingError}. Повторим автоматически.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {currentProposal.status === 'READY' ? (
        <div className="ai-proposal-candidates">
          <div className="ai-proposal-panel__safety-note">
            <strong>Выбор варианта ещё ничего не применяет.</strong>
            <span>Это только предварительный выбор педагога для следующего шага.</span>
          </div>

          {currentProposal.candidates.map((candidate, index) => {
            const selected = candidate.id === selectedCandidateId;
            return (
              <article
                key={candidate.id}
                className={`ai-candidate ${selected ? 'is-selected' : ''}`}
              >
                <div className="ai-candidate__topline">
                  <span>Вариант {index + 1}</span>
                  {selected ? <span className="ai-candidate__selected">✓ Выбран</span> : null}
                </div>
                <p className="ai-candidate__value">{candidate.value}</p>
                <div className="ai-candidate__explanation">
                  <strong>Почему AI предлагает этот вариант</strong>
                  <p>{candidate.rationale}</p>
                </div>
                {candidate.distinction ? (
                  <div className="ai-candidate__distinction">
                    <strong>Чем отличается</strong>
                    <p>{candidate.distinction}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  className={selected ? 'button button-secondary' : 'button button-ghost'}
                  onClick={() => setSelectedCandidateId(selected ? null : candidate.id)}
                >
                  {selected ? 'Снять выбор' : 'Выбрать этот вариант'}
                </button>
              </article>
            );
          })}

          {selectedCandidate ? (
            <div className="ai-proposal-selection-summary">
              <span>Выбран вариант</span>
              <strong>{selectedCandidate.value}</strong>
              <p>
                На следующем этапе появится отдельное действие «Применить». До этого authoritative state урока остаётся прежним.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {currentProposal.status === 'STALE' ? (
        <div className="ai-proposal-message ai-proposal-message--warning">
          <strong>Предложение больше не соответствует текущей версии урока.</strong>
          <p>
            {failure ??
              'После постановки запроса педагог изменил исходное решение или версию урока.'}
          </p>
        </div>
      ) : null}

      {currentProposal.status === 'FAILED' ? (
        <div className="ai-proposal-message ai-proposal-message--error">
          <strong>AI не смог подготовить предложение.</strong>
          <p>
            {failure ??
              'Запрос завершился ошибкой. Утверждённое решение педагога не изменилось.'}
          </p>
        </div>
      ) : null}

      {currentProposal.status === 'CANCELLED' ? (
        <div className="ai-proposal-message">
          <strong>Запрос отменён.</strong>
          <p>Состояние урока осталось без изменений.</p>
        </div>
      ) : null}

      <div className="ai-proposal-panel__meta">
        <span>Proposal {currentProposal.id}</span>
        <span>Основа: версия урока {currentProposal.requestedLessonVersion}</span>
        {currentProposal.baseRevision !== undefined ? (
          <span>Ревизия поля {currentProposal.baseRevision}</span>
        ) : null}
        {currentProposal.provider && currentProposal.model ? (
          <span>
            {currentProposal.provider} · {currentProposal.model}
          </span>
        ) : null}
        {currentProposal.promptVersion ? (
          <span>Prompt {currentProposal.promptVersion}</span>
        ) : null}
      </div>
    </section>
  );
}
