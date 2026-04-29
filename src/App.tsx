import { useEffect, useState } from 'react';
import { Pagination } from './Pagination';
import { PostLinkCell } from './PostLinkCell';
import { SeasonalCalendar } from './SeasonalCalendar';
import { StatsPanel } from './StatsPanel';
import { STRINGS, type Lang } from './i18n';
import type { Category, DashboardResponse, Settings } from './types';

type CrawlStatus = { busy: boolean; message: string | null };

export function App() {
  const lang: Lang = 'ko';
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [crawl, setCrawl] = useState<CrawlStatus>({ busy: false, message: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'todo' | 'published' | 'all'>('all');
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'risk' | 'published' | 'postLink' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(col: 'risk' | 'published' | 'postLink') {
    if (sortBy !== col) {
      setSortBy(col);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortBy(null);
    }
    setPage(1);
  }
  const sortIndicator = (col: 'risk' | 'published' | 'postLink') =>
    sortBy === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  const t = STRINGS[lang];
  const PAGE_SIZE = 30;

  async function loadAll() {
    const [d, c, s] = await Promise.all([
      fetch('/api/dashboard').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]);
    setDashboard(d);
    setCategories(c);
    setSettings(s);
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function runSyncAll() {
    setCrawl({ busy: true, message: '시작 중…' });
    try {
      const start = await fetch('/api/sync-all', { method: 'POST' });
      const startJ = await start.json();
      if (!start.ok && start.status !== 409) {
        throw new Error(startJ.error ?? 'failed to start');
      }

      // Poll status every 1.5s and refresh dashboard data periodically too
      let polls = 0;
      const poll = async (): Promise<void> => {
        const r = await fetch('/api/sync-all/status').then((x) => x.json());
        polls++;
        if (r.state === 'running') {
          const pct = r.progress.total
            ? Math.round((r.progress.done / r.progress.total) * 100)
            : 0;
          setCrawl({
            busy: true,
            message: `${r.step}: ${r.progress.done}/${r.progress.total} (${pct}%) · 누적 ${r.totals.fetched}건 수집`,
          });
          // Refresh dashboard every ~6s so user sees rows fill in live
          if (polls % 4 === 0) await loadAll();
          await new Promise((res) => setTimeout(res, 1500));
          return poll();
        }
        if (r.state === 'error') {
          setCrawl({ busy: false, message: `오류: ${r.error}` });
          return;
        }
        // done
        setCrawl({
          busy: false,
          message: `완료: 서브 ${r.totals.discovered}개 신규 발견 · 글 ${r.totals.fetched}건 (신규 ${r.totals.added} · 갱신 ${r.totals.updated})`,
        });
        await loadAll();
      };
      await poll();
    } catch (err) {
      setCrawl({ busy: false, message: `오류: ${(err as Error).message}` });
    }
  }


  async function runBackfill() {
    setCrawl({ busy: true, message: '블로그 sync 시작 중…' });
    try {
      const res = await fetch('/api/backfill/naver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: 'lgeservice_kr',
          maxPages: 30,
          maxCategoryNo: 50,
        }),
      });
      const j = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(j.error ?? 'failed');

      // Background mode: poll status
      let polls = 0;
      const poll = async (): Promise<void> => {
        const r = await fetch('/api/backfill/naver/status').then((x) => x.json());
        polls++;
        if (r.state === 'running') {
          const pct = r.progress.total
            ? Math.round((r.progress.done / r.progress.total) * 100)
            : 0;
          setCrawl({
            busy: true,
            message: `백필 중: 카테고리 ${r.progress.done}/${r.progress.total} (${pct}%) · 누적 ${r.totals.fetched}건 수집 (신규 ${r.totals.added})`,
          });
          if (polls % 3 === 0) await loadAll();
          await new Promise((res) => setTimeout(res, 2000));
          return poll();
        }
        if (r.state === 'error') {
          setCrawl({ busy: false, message: `오류: ${r.error}` });
          return;
        }
        setCrawl({
          busy: false,
          message: `완료: 카테고리 ${r.progress.done}개 순회 · 글 ${r.totals.fetched}건 (신규 ${r.totals.added} · 갱신 ${r.totals.updated})`,
        });
        await loadAll();
      };
      await poll();
    } catch (err) {
      setCrawl({ busy: false, message: `오류: ${(err as Error).message}` });
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{t.appTitle}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
      </header>

      <section className="summary">
        <div className="metric">
          <div className="metric-label">{t.summary.sources}</div>
          <div className="metric-value">{dashboard?.totals.articles ?? '—'}</div>
        </div>
        <div className="metric">
          <div className="metric-label">{t.summary.blogPosts}</div>
          <div className="metric-value">{dashboard?.totals.blogPosts ?? '—'}</div>
        </div>
        <div className="metric">
          <div className="metric-label">{t.summary.lastCrawl}</div>
          <div className="metric-value sm">
            {settings?.lastSourceCrawlAt
              ? new Date(settings.lastSourceCrawlAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')
              : t.summary.never}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">{t.summary.lastBackfill}</div>
          <div className="metric-value sm">
            {settings?.lastBackfillAt
              ? new Date(settings.lastBackfillAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')
              : t.summary.never}
          </div>
        </div>
      </section>

      <section className="actions">
        <button
          onClick={runSyncAll}
          disabled={crawl.busy}
          type="button"
          className="primary-btn"
          title={t.actions.syncAllHint}
        >
          {t.actions.syncAll}
        </button>
        <button
          onClick={runBackfill}
          disabled={crawl.busy}
          type="button"
          title={t.actions.backfillHint}
        >
          {t.actions.backfillNaver}
        </button>
        <button onClick={loadAll} disabled={crawl.busy} type="button" className="muted-btn">
          {t.actions.refresh}
        </button>
        {crawl.message && <span className="status">{crawl.message}</span>}
      </section>

      <SeasonalCalendar refreshKey={refreshKey} />

      {(() => {
        const allRows = dashboard?.rows ?? [];
        // 미발행 = 포스팅 링크 없는 행 (matchedPost null)
        // 포스팅 완료 = 포스팅 링크 있는 행 (확정 매핑 + 자동 매칭 모두 포함)
        const isPosted = (r: typeof allRows[number]) => r.matchedPost !== null;

        const q = searchQuery.trim().toLowerCase();
        const inCategory = (r: typeof allRows[number]) =>
          categoryFilter === 'all' || r.article.categoryId === categoryFilter;
        const matchesSearch = (r: typeof allRows[number]) =>
          !q || r.article.title.toLowerCase().includes(q);
        const scoped = allRows.filter((r) => inCategory(r) && matchesSearch(r));
        const postedCount = scoped.filter(isPosted).length;
        const todoCount = scoped.length - postedCount;

        const categoryCounts = new Map<string, number>();
        for (const r of allRows) {
          categoryCounts.set(
            r.article.categoryId,
            (categoryCounts.get(r.article.categoryId) ?? 0) + 1,
          );
        }

        const RISK_RANK: Record<string, number> = { red: 4, yellow: 3, green: 2, none: 1 };
        const dir = sortDir === 'desc' ? -1 : 1;

        const filtered = scoped
          .filter((r) => {
            if (statusFilter === 'todo') return !isPosted(r);
            if (statusFilter === 'published') return isPosted(r);
            return true;
          })
          .slice()
          .sort((a, b) => {
            // Custom sort if active
            if (sortBy === 'risk') {
              const diff = (RISK_RANK[a.risk.level] ?? 0) - (RISK_RANK[b.risk.level] ?? 0);
              if (diff !== 0) return -diff * dir;
            } else if (sortBy === 'published') {
              const da = a.article.publishedAt ?? '';
              const db = b.article.publishedAt ?? '';
              if (da !== db) return -da.localeCompare(db) * dir;
            } else if (sortBy === 'postLink') {
              const da = a.matchedPost?.publishedAt ?? '';
              const db = b.matchedPost?.publishedAt ?? '';
              // Empty postLink dates always go to bottom regardless of direction
              if (!da && db) return 1;
              if (da && !db) return -1;
              if (da !== db) return -da.localeCompare(db) * dir;
            }
            // Default: original article publishedAt desc
            const da = a.article.publishedAt ?? '';
            const db = b.article.publishedAt ?? '';
            return db.localeCompare(da);
          });

        return (
          <section className="grid">
            <header className="dash-head">
              <h2>
                {t.todo.title}{' '}
                <span className="todo-count-pill">{t.todo.count(scoped.length)}</span>
              </h2>
              <div className="search-wrap">
                <input
                  type="search"
                  className="search-input"
                  placeholder="제목 검색…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                    }}
                    title="검색어 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="filter-chips">
                <button
                  type="button"
                  className={statusFilter === 'all' ? 'chip active' : 'chip'}
                  onClick={() => { setStatusFilter('all'); setPage(1); }}
                >
                  {t.todo.filterAll} ({scoped.length})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'todo' ? 'chip active' : 'chip'}
                  onClick={() => { setStatusFilter('todo'); setPage(1); }}
                >
                  {t.todo.filterTodo} ({todoCount})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'published' ? 'chip active' : 'chip'}
                  onClick={() => { setStatusFilter('published'); setPage(1); }}
                >
                  {t.todo.filterPublished} ({postedCount})
                </button>
              </div>
            </header>

            <div className="category-row">
              <span className="filter-label">카테고리:</span>
              <div className="filter-chips category-chips">
                <button
                  type="button"
                  className={categoryFilter === 'all' ? 'chip active' : 'chip'}
                  onClick={() => { setCategoryFilter('all'); setPage(1); }}
                >
                  전체 ({allRows.length.toLocaleString()})
                </button>
                {categories
                  .filter((c) => (categoryCounts.get(c.id) ?? 0) > 0)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={categoryFilter === c.id ? 'chip active' : 'chip'}
                      onClick={() => { setCategoryFilter(c.id); setPage(1); }}
                    >
                      {lang === 'ko' ? c.nameKo : c.nameEn} ({categoryCounts.get(c.id) ?? 0})
                    </button>
                  ))}
              </div>
            </div>

            {(() => {
              const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
              const safePage = Math.min(page, totalPages);
              const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
              return (
            <>
            {filtered.length === 0 ? (
              <p className="empty">{t.empty.sources}</p>
            ) : (
              <table className="rows">
                <thead>
                  <tr>
                    <th
                      className={'sortable' + (sortBy === 'risk' ? ' active' : '')}
                      onClick={() => toggleSort('risk')}
                    >
                      {t.cols.risk}{sortIndicator('risk')}
                    </th>
                    <th>{t.cols.title}</th>
                    <th>{t.cols.category}</th>
                    <th
                      className={'sortable' + (sortBy === 'published' ? ' active' : '')}
                      onClick={() => toggleSort('published')}
                    >
                      {t.cols.published}{sortIndicator('published')}
                    </th>
                    <th
                      className={'sortable' + (sortBy === 'postLink' ? ' active' : '')}
                      onClick={() => toggleSort('postLink')}
                    >
                      {t.cols.postLink}{sortIndicator('postLink')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const dangerous = row.risk.level === 'red';
                    return (
                      <tr
                        key={row.article.seqId}
                        className={dangerous ? 'row-dangerous' : ''}
                      >
                        <td>
                          <span className={`risk risk-${row.risk.level}`}>
                            {row.risk.level === 'red' && '🔴'}
                            {row.risk.level === 'yellow' && '🟡'}
                            {row.risk.level === 'green' && '🟢'}
                            {row.risk.level === 'none' && '✨'}
                            <span className="risk-text">
                              {t.risk[row.risk.level === 'none' ? 'none' : row.risk.level]}
                            </span>
                          </span>
                        </td>
                        <td className="title-cell">
                          <a href={row.article.url} target="_blank" rel="noreferrer" className="title-link">
                            {row.article.title}
                          </a>
                          {row.risk.reason && row.risk.level !== 'none' && (
                            <span className="reason"> · {row.risk.reason}</span>
                          )}
                          {row.article.workflow?.memo && (
                            <span className="memo-inline" title={row.article.workflow.memo}>📝</span>
                          )}
                        </td>
                        <td className="muted">{row.article.cateName}</td>
                        <td className="muted">{row.article.publishedAt ?? '—'}</td>
                        <td>
                          <PostLinkCell
                            lang={lang}
                            seqId={row.article.seqId}
                            matchedPost={row.matchedPost}
                            matchSource={row.matchSource}
                            onChanged={loadAll}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {filtered.length > PAGE_SIZE && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
            </>
              );
            })()}
          </section>
        );
      })()}

      <StatsPanel lang={lang} refreshKey={refreshKey} />
    </div>
  );
}
