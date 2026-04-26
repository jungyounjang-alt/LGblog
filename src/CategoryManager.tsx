import { useState } from 'react';
import { STRINGS, type Lang } from './i18n';
import type { Category } from './types';

interface Props {
  lang: Lang;
  categories: Category[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

interface DraftMap {
  [categoryId: string]: { id: string; productCode: string; nameKo: string; nameEn: string };
}

const blank = { id: '', productCode: '', nameKo: '', nameEn: '' };

export function CategoryManager({ lang, categories, onClose, onChanged }: Props) {
  const t = STRINGS[lang];
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getDraft(catId: string) {
    return drafts[catId] ?? blank;
  }

  function patchDraft(catId: string, patch: Partial<typeof blank>) {
    setDrafts((d) => ({ ...d, [catId]: { ...getDraft(catId), ...patch } }));
  }

  async function add(catId: string) {
    const d = getDraft(catId);
    if (!d.id || !d.productCode || !d.nameKo) return;
    setBusy(catId);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${catId}/subcategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      setDrafts((m) => ({ ...m, [catId]: blank }));
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(catId: string, subId: string) {
    setBusy(`${catId}/${subId}`);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${catId}/subcategories/${subId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'failed');
      }
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{t.catManager.title}</h2>
          <button onClick={onClose} type="button" className="x-btn">
            ×
          </button>
        </header>
        <p className="hint">{t.catManager.hint}</p>
        {error && <div className="error">{error}</div>}
        <div className="cat-list">
          {categories.map((cat) => {
            const d = getDraft(cat.id);
            return (
              <section key={cat.id} className="cat-block">
                <h3>
                  {lang === 'ko' ? cat.nameKo : cat.nameEn}{' '}
                  <span className="muted small">({cat.id})</span>
                </h3>
                {cat.subcategories.length === 0 ? (
                  <p className="muted small">{t.catManager.noSubs}</p>
                ) : (
                  <ul className="sub-list">
                    {cat.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <span>
                          {lang === 'ko' ? sub.nameKo : sub.nameEn}{' '}
                          <span className="muted small">
                            ({sub.id} / {sub.productCode})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(cat.id, sub.id)}
                          disabled={busy === `${cat.id}/${sub.id}`}
                          className="link-btn"
                        >
                          {t.catManager.remove}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="add-row">
                  <input
                    placeholder={t.catManager.subId}
                    value={d.id}
                    onChange={(e) => patchDraft(cat.id, { id: e.target.value.trim() })}
                  />
                  <input
                    placeholder={t.catManager.productCode}
                    value={d.productCode}
                    onChange={(e) => patchDraft(cat.id, { productCode: e.target.value.trim() })}
                  />
                  <input
                    placeholder={t.catManager.nameKo}
                    value={d.nameKo}
                    onChange={(e) => patchDraft(cat.id, { nameKo: e.target.value })}
                  />
                  <input
                    placeholder={t.catManager.nameEn}
                    value={d.nameEn}
                    onChange={(e) => patchDraft(cat.id, { nameEn: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => add(cat.id)}
                    disabled={busy === cat.id || !d.id || !d.productCode || !d.nameKo}
                  >
                    {t.catManager.add}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
