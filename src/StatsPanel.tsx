import { useEffect, useState } from 'react';
import type { Lang } from './i18n';

interface CategoryRank {
  categoryId: string;
  nameKo: string;
  count: number;
}
interface RankBucket {
  ranked: CategoryRank[];
  unmapped: number;
}
interface TopViewed {
  article: { seqId: string; title: string; url: string; cateName: string };
  view: number;
  matchedBlogPost: { title: string; url: string; publishedAt: string | null } | null;
}
interface StatsResponse {
  categoryRank: { all: RankBucket; last30: RankBucket; last90: RankBucket };
  topViewed: TopViewed[];
  blogViewsAvailable: boolean;
  totals: { blogPosts: number; mapped: number; unmapped: number };
}

interface Props {
  lang: Lang;
  refreshKey: number;
}

type Range = 'all' | 'last30' | 'last90';

export function StatsPanel({ lang, refreshKey }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [range, setRange] = useState<Range>('all');

  useEffect(() => {
    void fetch('/api/stats')
      .then((r) => r.json())
      .then(setData);
  }, [refreshKey]);

  if (!data) return null;
  const bucket = data.categoryRank[range];
  const rangeLabel: Record<Range, string> = {
    all: lang === 'ko' ? '전체' : 'All',
    last30: lang === 'ko' ? '최근 30일' : 'Last 30 days',
    last90: lang === 'ko' ? '최근 90일' : 'Last 90 days',
  };

  return (
    <section className="stats grid stats-grid">
      {/* Card 1: category ranking */}
      <div className="stats-card">
        <div className="stats-head">
          <h3>{lang === 'ko' ? '카테고리별 블로그 발행 수' : 'Blog posts by category'}</h3>
          <div className="filter-chips small-chips">
            {(['all', 'last30', 'last90'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? 'chip active' : 'chip'}
                onClick={() => setRange(r)}
              >
                {rangeLabel[r]}
              </button>
            ))}
          </div>
        </div>
        {bucket.ranked.length === 0 ? (
          <p className="muted small">데이터 없음</p>
        ) : (
          <ol className="rank-list">
            {bucket.ranked.map((r, i) => (
              <li key={r.categoryId}>
                <span className="rank-num">{i + 1}</span>
                <span className="rank-name">{r.nameKo}</span>
                <span className="rank-count">{r.count.toLocaleString()}건</span>
              </li>
            ))}
          </ol>
        )}
        {bucket.unmapped > 0 && (
          <div className="muted small unmapped-hint">
            {lang === 'ko'
              ? `미매칭 ${bucket.unmapped.toLocaleString()}건 (이벤트·공지 등)`
              : `${bucket.unmapped} unmapped (events/notices)`}
          </div>
        )}
      </div>

      {/* Card 2: top viewed (LG article-based) */}
      <div className="stats-card">
        <div className="stats-head">
          <h3>
            {lang === 'ko' ? '인기 콘텐츠 (조회수 Top 5)' : 'Top 5 most-viewed'}
          </h3>
          <span className="muted small">
            {lang === 'ko' ? 'LG 스스로 해결 기준' : 'LG self-solve view counts'}
          </span>
        </div>
        <ol className="top-viewed">
          {data.topViewed.map((t, i) => (
            <li key={t.article.seqId}>
              <div className="tv-row1">
                <span className="rank-num">{i + 1}</span>
                <span className="tv-view">{t.view.toLocaleString()}회</span>
                <span className="tv-cat muted small">{t.article.cateName}</span>
              </div>
              <a href={t.article.url} target="_blank" rel="noreferrer" className="tv-title">
                {t.article.title}
              </a>
              {t.matchedBlogPost ? (
                <a
                  href={t.matchedBlogPost.url}
                  target="_blank"
                  rel="noreferrer"
                  className="tv-blog"
                >
                  → {t.matchedBlogPost.title}{' '}
                  {t.matchedBlogPost.publishedAt && (
                    <span className="muted small">({t.matchedBlogPost.publishedAt})</span>
                  )}
                </a>
              ) : (
                <span className="tv-blog muted small">→ 매칭된 블로그 글 없음</span>
              )}
            </li>
          ))}
        </ol>
        {!data.blogViewsAvailable && (
          <div className="muted small note-text">
            ※ 네이버 블로그 글 조회수는 데이터가 없어 LG 스스로 해결 글의 조회수로 대체.
          </div>
        )}
      </div>
    </section>
  );
}
