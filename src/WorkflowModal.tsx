import { useState } from 'react';
import { STRINGS, type Lang } from './i18n';
import type { SourceArticle, WorkflowStatus } from './types';

export type WorkflowMode = 'request' | 'publish' | 'memo';

interface Props {
  lang: Lang;
  mode: WorkflowMode;
  article: SourceArticle;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export function WorkflowModal({ lang, mode, article, onClose, onChanged }: Props) {
  const t = STRINGS[lang];
  const w = article.workflow ?? {
    status: 'pending' as WorkflowStatus,
    assignee: null,
    memo: null,
    requestedAt: null,
    updatedAt: '',
  };

  const [assignee, setAssignee] = useState(w.assignee ?? '');
  const [memo, setMemo] = useState(w.memo ?? '');
  const [status, setStatus] = useState<WorkflowStatus>(w.status);
  const [blogUrl, setBlogUrl] = useState('');
  const [blogTitle, setBlogTitle] = useState('');
  const [blogDate, setBlogDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function patchWorkflow(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/source-articles/${article.seqId}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      await onChanged();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest() {
    const ok = await patchWorkflow({
      status: 'requested',
      assignee: assignee || null,
      memo: memo || null,
    });
    if (ok) onClose();
  }

  async function submitMemo() {
    const ok = await patchWorkflow({
      status,
      assignee: assignee || null,
      memo: memo || null,
    });
    if (ok) onClose();
  }

  async function submitPublish() {
    if (!blogUrl) {
      setError(lang === 'ko' ? 'URL이 필요합니다.' : 'URL is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/blog-posts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: blogUrl,
          title: blogTitle || article.title,
          publishedAt: blogDate || undefined,
          sourceSeqId: article.seqId,
          assignedTo: assignee || w.assignee,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      await onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    if (!assignee) {
      setError(lang === 'ko' ? '담당자 이름이 필요합니다.' : 'Assignee is required.');
      return;
    }
    const msg = t.workflow.messageTemplate(article.title, article.url, assignee);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(lang === 'ko' ? '복사 실패' : 'Copy failed');
    }
  }

  const title =
    mode === 'request'
      ? t.workflow.requestPublish
      : mode === 'publish'
      ? t.workflow.registerTitle
      : t.workflow.memoTitle;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compact" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} type="button" className="x-btn">
            ×
          </button>
        </header>
        <div className="article-summary">
          <strong>{article.title}</strong>
          <div className="muted small">
            {article.cateName} · {article.publishedAt ?? '—'}
          </div>
        </div>
        {error && <div className="error">{error}</div>}

        {mode === 'request' && (
          <>
            <label className="form-row">
              <span>{t.workflow.assigneePrompt}</span>
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </label>
            <label className="form-row">
              <span>{t.workflow.memoTitle}</span>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder={t.workflow.memoHint}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                onClick={copyMessage}
                disabled={busy || !assignee}
                className="secondary"
              >
                {copied ? t.workflow.copied : t.workflow.copyMessage}
              </button>
              <button type="button" onClick={submitRequest} disabled={busy}>
                {t.workflow.requestPublish}
              </button>
            </div>
          </>
        )}

        {mode === 'publish' && (
          <>
            <p className="hint">{t.workflow.registerHint}</p>
            <label className="form-row">
              <span>{t.workflow.blogUrlLabel} *</span>
              <input
                value={blogUrl}
                onChange={(e) => setBlogUrl(e.target.value)}
                placeholder="https://blog.naver.com/lgeservice_kr/2242..."
              />
            </label>
            <label className="form-row">
              <span>{t.workflow.blogTitleLabel}</span>
              <input
                value={blogTitle}
                onChange={(e) => setBlogTitle(e.target.value)}
                placeholder={article.title}
              />
            </label>
            <label className="form-row">
              <span>{t.workflow.blogDateLabel}</span>
              <input
                value={blogDate}
                onChange={(e) => setBlogDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>
            <label className="form-row">
              <span>{t.workflow.assigneePrompt}</span>
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={submitPublish} disabled={busy || !blogUrl}>
                {t.workflow.register}
              </button>
            </div>
          </>
        )}

        {mode === 'memo' && (
          <>
            <label className="form-row">
              <span>{t.workflow.changeStatus}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
              >
                <option value="pending">{t.status.pending}</option>
                <option value="requested">{t.status.requested}</option>
                <option value="in_progress">{t.status.in_progress}</option>
                <option value="review">{t.status.review}</option>
              </select>
            </label>
            <label className="form-row">
              <span>{t.workflow.assigneePrompt}</span>
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </label>
            <label className="form-row">
              <span>{t.workflow.memoTitle}</span>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={4}
                placeholder={t.workflow.memoHint}
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={submitMemo} disabled={busy}>
                {t.workflow.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
