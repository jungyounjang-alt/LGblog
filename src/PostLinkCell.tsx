import { useState } from 'react';
import { STRINGS, type Lang } from './i18n';
import type { BlogPost } from './types';

interface Props {
  lang: Lang;
  seqId: string;
  matchedPost: BlogPost | null;
  matchSource: 'confirmed' | 'title_match' | null;
  onChanged: () => Promise<void>;
}

export function PostLinkCell({ lang, seqId, matchedPost, matchSource, onChanged }: Props) {
  const t = STRINGS[lang].postLink;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'POST' | 'PUT', path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/source-articles/${seqId}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      await onChanged();
      setEditing(false);
      setInput('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setInput(matchedPost?.url ?? '');
    setEditing(true);
    setError(null);
  }

  // Editing input mode
  if (editing) {
    return (
      <div className="post-link-edit">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input) call('POST', 'link-blog', { url: input.trim() });
            if (e.key === 'Escape') {
              setEditing(false);
              setInput('');
            }
          }}
          placeholder={t.placeholder}
          disabled={busy}
        />
        <div className="row">
          <button
            type="button"
            disabled={busy || !input}
            onClick={() => call('POST', 'link-blog', { url: input.trim() })}
          >
            {busy ? t.saving : 'Enter'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setInput('');
            }}
          >
            취소
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </div>
    );
  }

  // Confirmed (explicit mapping)
  if (matchedPost && matchSource === 'confirmed') {
    return (
      <div className="post-link-cell confirmed">
        <a href={matchedPost.url} target="_blank" rel="noreferrer" className="link">
          {matchedPost.publishedAt ?? '✓'}{' '}
          <span className="muted small">·{matchedPost.postId.slice(-6)}</span>
        </a>
        <div className="row small-actions">
          <button type="button" className="link-btn" onClick={startEdit} disabled={busy}>
            {t.editBtn}
          </button>
          <button
            type="button"
            className="link-btn warn"
            onClick={() => call('PUT', 'unlink-blog')}
            disabled={busy}
          >
            {t.unlinkBtn}
          </button>
        </div>
      </div>
    );
  }

  // Auto-suggested (title match, not yet confirmed)
  if (matchedPost && matchSource === 'title_match') {
    return (
      <div className="post-link-cell suggested">
        <a href={matchedPost.url} target="_blank" rel="noreferrer" className="link suggested-link">
          {matchedPost.publishedAt ?? '?'}{' '}
          <span className="muted small">· {t.suggested}</span>
        </a>
        <div className="row small-actions">
          <button
            type="button"
            className="link-btn confirm-btn"
            onClick={() => call('POST', 'link-blog', { postId: matchedPost.postId })}
            disabled={busy}
          >
            {busy ? t.saving : t.confirmBtn}
          </button>
          <button type="button" className="link-btn" onClick={startEdit} disabled={busy}>
            {t.editBtn}
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </div>
    );
  }

  // Empty — no match, ready to paste
  return (
    <div className="post-link-cell empty">
      <button type="button" className="add-link-btn" onClick={startEdit}>
        + URL
      </button>
    </div>
  );
}
