import { useEffect, useMemo, useState } from 'react';
import type { LessonAiProposal } from '../types.js';
import './AiProposalPanel.css';

interface AiProposalPanelProps {
  proposal: LessonAiProposal;
}

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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCandidateId(null);
  }, [proposal.id]);

  const selectedCandidate = useMemo(
    () => proposal.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [proposal.candidates, selectedCandidateId]
  );

  const isPending = proposal.status === 'QUEUED' || proposal.status === 'RUNNING';
  const failure = errorText(proposal);

  return (
    <section className={`ai-proposal-panel ai-proposal-panel--${proposal.status.toLowerCase()}`} aria-live="polite">
      <div className="ai-proposal-panel__header">
        <div>
          <span className="ai-proposal-panel__eyebrow">AI-предложение · отдельно от решения педагога</span>
          <h4>{actionLabel[proposal.action]}</h4>
        </div>
        <span className="ai-proposal-panel__status">{statusLabel[proposal.status]}</span>
      </div>

      {isPending ? (
        <div className="ai-proposal-progress">
          <span className="ai-proposal-progress__dot" aria-hidden="true" />
          <div>
            <strong>{proposal.status === 'QUEUED' ? 'Запрос принят' : 'Идёт генерация'}</strong>
            <p>
              Утверждённый текст урока не меняется. Экран обновит статус автоматически после завершения worker-задачи.
            </p>
          </div>
        </div>
      ) : null}

      {proposal.status === 'READY' ? (
        <div className="ai-proposal-candidates">
          <div className="ai-proposal-panel__safety-note">
            <strong>Выбор варианта ещё ничего не применяет.</strong>
            <span>Это только предварительный выбор педагога для следующего шага.</span>
          </div>

          {proposal.candidates.map((candidate, index) => {
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

      {proposal.status === 'STALE' ? (
        <div className="ai-proposal-message ai-proposal-message--warning">
          <strong>Предложение больше не соответствует текущей версии урока.</strong>
          <p>{failure ?? 'После постановки запроса педагог изменил исходное решение или версию урока.'}</p>
        </div>
      ) : null}

      {proposal.status === 'FAILED' ? (
        <div className="ai-proposal-message ai-proposal-message--error">
          <strong>AI не смог подготовить предложение.</strong>
          <p>{failure ?? 'Запрос завершился ошибкой. Утверждённое решение педагога не изменилось.'}</p>
        </div>
      ) : null}

      {proposal.status === 'CANCELLED' ? (
        <div className="ai-proposal-message">
          <strong>Запрос отменён.</strong>
          <p>Состояние урока осталось без изменений.</p>
        </div>
      ) : null}

      <div className="ai-proposal-panel__meta">
        <span>Proposal {proposal.id}</span>
        <span>Основа: версия урока {proposal.requestedLessonVersion}</span>
        {proposal.baseRevision !== undefined ? <span>Ревизия поля {proposal.baseRevision}</span> : null}
        {proposal.provider && proposal.model ? <span>{proposal.provider} · {proposal.model}</span> : null}
        {proposal.promptVersion ? <span>Prompt {proposal.promptVersion}</span> : null}
      </div>
    </section>
  );
}
