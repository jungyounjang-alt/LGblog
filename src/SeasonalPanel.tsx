import { useEffect, useState } from 'react';
import { STRINGS, type Lang } from './i18n';

interface SeasonalRecommendation {
  keywords: string[];
  reasonKo: string;
  reasonEn: string;
  postsThisMonth: number;
  postsLast90Days: number;
  recommendedMin: number;
  status: 'ok' | 'low' | 'critical';
}

interface SeasonalResponse {
  month: number;
  monthLabelKo: string;
  monthLabelEn: string;
  recommendations: SeasonalRecommendation[];
  notes: { ko: string; en: string }[];
}

interface Props {
  lang: Lang;
  refreshKey: number;
}

export function SeasonalPanel({ lang, refreshKey }: Props) {
  const t = STRINGS[lang];
  const [data, setData] = useState<SeasonalResponse | null>(null);

  useEffect(() => {
    void fetch('/api/seasonal')
      .then((r) => r.json())
      .then(setData);
  }, [refreshKey]);

  if (!data) return null;

  const monthLabel = lang === 'ko' ? data.monthLabelKo : data.monthLabelEn;
  const statusLabel = (s: SeasonalRecommendation['status']) =>
    s === 'ok' ? t.seasonal.statusOk : s === 'low' ? t.seasonal.statusLow : t.seasonal.statusCritical;

  return (
    <section className="seasonal grid">
      <header className="seasonal-head">
        <h2>
          {t.seasonal.title} · <span className="month-pill">{monthLabel}</span>
        </h2>
        {data.notes.length > 0 && (
          <div className="seasonal-notes">
            <span className="note-label">{t.seasonal.notes}:</span>
            {data.notes.map((n, i) => (
              <span key={i} className="note-chip">
                {lang === 'ko' ? n.ko : n.en}
              </span>
            ))}
          </div>
        )}
      </header>
      <ul className="seasonal-list">
        {data.recommendations.map((r, i) => (
          <li key={i} className={`seasonal-item st-${r.status}`}>
            <div className="kw-line">
              {r.keywords.map((k) => (
                <span key={k} className="kw-chip">
                  {k}
                </span>
              ))}
              <span className={`status-badge st-rec-${r.status}`}>{statusLabel(r.status)}</span>
            </div>
            <div className="reason muted small">{lang === 'ko' ? r.reasonKo : r.reasonEn}</div>
            <div className="metrics">
              <span>
                {t.seasonal.thisMonth}: <strong>{r.postsThisMonth}</strong> / {r.recommendedMin}{' '}
                <span className="muted small">{t.seasonal.ofRecommended}</span>
              </span>
              <span className="muted small">
                {t.seasonal.last90}: {r.postsLast90Days}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
