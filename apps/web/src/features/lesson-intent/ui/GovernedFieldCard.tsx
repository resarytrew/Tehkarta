import { useEffect, useMemo, useState } from 'react';
import type { GovernedField } from '@tehkarta/domain';
import type { CoreDecisionKey } from '../../../entities/lesson/model.js';
import type { LessonAiProposal } from '../../../entities/proposal/model.js';
import { AiProposalPanel } from '../../ai-proposals/ui/AiProposalPanel.js';
import { useProposalHistory } from '../../ai-proposals/model/useProposalHistory.js';

export type AiFieldAction = 'variants' | 'regenerate' | 'improve';

interface GovernedFieldCardProps {
  semanticKey: CoreDecisionKey;
  title: string;
  description: string;
  field: GovernedField<string> | undefined;
  busy: boolean;
  aiBusy: boolean;
  latestProposal: LessonAiProposal | undefined;
  applyingAiCandidateId?: string | null;
  onSaveDraft(value: string): Promise<void>;
  onApply(value: string): Promise<void>;
  onAiAction(action: AiFieldAction, semanticKey: CoreDecisionKey): Promise<void>;
  onApplyAiCandidate(proposalId: string, candidateId: string): Promise<void>;
  onDismissAiProposal(proposal: LessonAiProposal): Promise<LessonAiProposal>;
}

const proposalStatusLabel: Record<LessonAiProposal['status'], string> = {
  QUEUED: 'В очереди',
  RUNNING: 'Генерируется',
  READY: 'Готово',
  APPLIED: 'Применено',
  DISMISSED: 'Отклонено',
  STALE: 'Устарело',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменено'
};

function statusPresentation(field?: GovernedField<string>): {
  label: string;
  className: string;
  detail: string;
} {
  if (!field) {
    return {
      label: 'Не задано',
      className: 'status-neutral',
      detail: 'Можно сформулировать вручную или запросить предложение AI.'
    };
  }

  if (field.meta.status === 'APPROVED') {
    return {
      label: '✓ Утверждено педагогом',
      className: 'status-approved',
      detail: `Версия ${field.meta.revision}. Используется во всех следующих шагах.`
    };
  }

  if (field.meta.status === 'EDITED') {
    return {
      label: '✎ Изменено педагогом',
      className: 'status-edited',
      detail: `Версия ${field.meta.revision}. Это черновик — дальше он не передаётся до применения.`
    };
  }

  return {
    label: '✨ Предложено AI',
    className: 'status-ai',
    detail: `Версия ${field.meta.revision}. AI предлагает, педагог принимает решение.`
  };
}

export function GovernedFieldCard({
  semanticKey,
  title,
  description,
  field,
  busy,
  aiBusy,
  latestProposal,
  applyingAiCandidateId = null,
  onSaveDraft,
  onApply,
  onAiAction,
  onApplyAiCandidate,
  onDismissAiProposal
}: GovernedFieldCardProps) {
  const [editing, setEditing] = useState(!field);
  const [draft, setDraft] = useState(field?.value ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const proposalHistory = useProposalHistory(latestProposal, semanticKey);

  useEffect(() => {
    if (!editing) setDraft(field?.value ?? '');
  }, [field, editing]);

  const status = useMemo(() => statusPresentation(field), [field]);
  const changed = draft.trim() !== (field?.value ?? '').trim();
  const valid = draft.trim().length >= 3;
  const activeProposal = proposalHistory.history[0] ?? latestProposal;

  async function run(action: () => Promise<void>) {
    setLocalError(null);
    try {
      await action();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    }
  }

  async function dismissActiveProposal(): Promise<LessonAiProposal> {
    if (!activeProposal) {
      throw new Error('AI-предложение недоступно для отклонения.');
    }
    const dismissed = await onDismissAiProposal(activeProposal);
    proposalHistory.put(dismissed);
    return dismissed;
  }

  async function requestMoreVariants(): Promise<void> {
    await onAiAction('variants', semanticKey);
  }

  return (
    <article className={`decision-card ${field?.meta.status === 'APPROVED' ? 'is-approved' : ''}`}>
      <div className="decision-card__header">
        <div>
          <div className="decision-card__eyebrow">Управляемое решение</div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={`status-chip ${status.className}`}>{status.label}</span>
      </div>

      {editing ? (
        <div className="decision-editor">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={semanticKey === 'goal' ? 4 : 3}
            disabled={busy}
            aria-label={title}
            autoFocus={!field}
          />
          <div className="decision-editor__meta">
            <span>{draft.trim().length} / 4000</span>
            <span>{status.detail}</span>
          </div>
          {localError ? <div className="inline-error">{localError}</div> : null}
          <div className="decision-editor__actions">
            {field ? (
              <button
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(field.value);
                  setEditing(false);
                  setLocalError(null);
                }}
              >
                Отменить
              </button>
            ) : null}
            <div className="decision-editor__actions-right">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !valid || !changed}
                onClick={() => void run(() => onSaveDraft(draft))}
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={busy || !valid}
                onClick={() =>
                  void run(async () => {
                    await onApply(draft);
                    setEditing(false);
                  })
                }
              >
                ✓ Применить
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="decision-value">
          <div className="decision-value__text">
            {field?.meta.status === 'APPROVED' ? <span className="lock-mark">🔒</span> : null}
            <p>{field?.value ?? 'Решение пока не сформулировано.'}</p>
          </div>
          <div className="decision-value__footer">
            <span>{status.detail}</span>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Изменить
            </button>
          </div>
        </div>
      )}

      <div className="ai-actions" aria-label={`AI-действия для поля ${title}`}>
        <span className="ai-actions__label">AI-помощник</span>
        <button
          type="button"
          disabled={aiBusy}
          onClick={() => void run(() => onAiAction('variants', semanticKey))}
        >
          ✨ Предложить варианты
        </button>
        <button
          type="button"
          disabled={aiBusy}
          onClick={() => void run(() => onAiAction('regenerate', semanticKey))}
        >
          ↻ Перегенерировать
        </button>
        <button
          type="button"
          disabled={aiBusy || !field}
          onClick={() => void run(() => onAiAction('improve', semanticKey))}
        >
          ✎ Улучшить
        </button>
      </div>

      {activeProposal ? (
        <AiProposalPanel
          proposal={activeProposal}
          applyingCandidateId={applyingAiCandidateId}
          onApplyCandidate={(candidateId) =>
            onApplyAiCandidate(activeProposal.id, candidateId)
          }
          onDismiss={dismissActiveProposal}
          onRequestMore={requestMoreVariants}
        />
      ) : null}

      {proposalHistory.history.length > 1 ? (
        <details className="ai-proposal-history">
          <summary>История AI-предложений · {proposalHistory.history.length}</summary>
          <div className="ai-proposal-history__list">
            {proposalHistory.history.slice(1).map((proposal) => (
              <div className="ai-proposal-history__item" key={proposal.id}>
                <div>
                  <strong>{proposalStatusLabel[proposal.status]}</strong>
                  <span>{new Date(proposal.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                <p>
                  {proposal.candidates[0]?.value ??
                    (proposal.status === 'FAILED'
                      ? 'Генерация завершилась ошибкой.'
                      : 'Предложение без сохранённого кандидата.')}
                </p>
                <small>
                  {proposal.provider && proposal.model
                    ? `${proposal.provider} · ${proposal.model}`
                    : `Proposal ${proposal.id}`}
                </small>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {proposalHistory.error ? <div className="inline-error">История: {proposalHistory.error}</div> : null}
    </article>
  );
}
