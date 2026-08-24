import { useEffect, useMemo, useState } from 'react';
import type { GovernedField } from '@tehkarta/domain';
import { TehkartaApiClient } from '../api.js';
import type { CoreDecisionKey, LessonAiProposal } from '../types.js';
import { AiProposalPanel } from './AiProposalPanel.js';

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

function putProposalFirst(
  current: LessonAiProposal[],
  proposal: LessonAiProposal
): LessonAiProposal[] {
  return [proposal, ...current.filter((item) => item.id !== proposal.id)];
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
  onApplyAiCandidate
}: GovernedFieldCardProps) {
  const [editing, setEditing] = useState(!field);
  const [draft, setDraft] = useState(field?.value ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [proposalHistory, setProposalHistory] = useState<LessonAiProposal[]>(
    latestProposal ? [latestProposal] : []
  );
  const [historyError, setHistoryError] = useState<string | null>(null);

  const proposalApi = useMemo(() => {
    if (!latestProposal) return null;
    const csrfToken = (
      window.sessionStorage.getItem('tehkarta.csrfToken') ??
      import.meta.env.VITE_DEV_CSRF_TOKEN ??
      ''
    ).trim();
    return new TehkartaApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
      workspaceId: latestProposal.workspaceId,
      ...(csrfToken ? { csrfToken } : {})
    });
  }, [latestProposal?.workspaceId]);

  useEffect(() => {
    if (!editing) setDraft(field?.value ?? '');
  }, [field, editing]);

  useEffect(() => {
    if (!latestProposal || !proposalApi) {
      setProposalHistory([]);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    setProposalHistory((current) => putProposalFirst(current, latestProposal));
    void proposalApi
      .listAiProposals(latestProposal.lessonId, semanticKey)
      .then((items) => {
        if (cancelled) return;
        setProposalHistory(items);
        setHistoryError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoryError(
          error instanceof Error ? error.message : 'Не удалось загрузить историю AI-предложений.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [latestProposal?.id, latestProposal?.updatedAt, proposalApi, semanticKey]);

  const status = useMemo(() => statusPresentation(field), [field]);
  const changed = draft.trim() !== (field?.value ?? '').trim();
  const valid = draft.trim().length >= 3;
  const activeProposal = proposalHistory[0] ?? latestProposal;

  async function run(action: () => Promise<void>) {
    setLocalError(null);
    try {
      await action();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    }
  }

  async function dismissActiveProposal(): Promise<LessonAiProposal> {
    if (!proposalApi || !activeProposal) {
      throw new Error('AI-предложение недоступно для отклонения.');
    }
    const dismissed = await proposalApi.dismissAiProposal(activeProposal.lessonId, activeProposal.id);
    setProposalHistory((current) => putProposalFirst(current, dismissed));
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

      {proposalHistory.length > 1 ? (
        <details className="ai-proposal-history">
          <summary>История AI-предложений · {proposalHistory.length}</summary>
          <div className="ai-proposal-history__list">
            {proposalHistory.slice(1).map((proposal) => (
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
      {historyError ? <div className="inline-error">История: {historyError}</div> : null}
    </article>
  );
}
