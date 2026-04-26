import { useEffect, useState } from 'react';
import { fetchRole, type Role } from './authClient';
import { CategoryManager } from './CategoryManager';
import { NotificationsPanel } from './NotificationsPanel';
import { PostLinkCell } from './PostLinkCell';
import { SeasonalPanel } from './SeasonalPanel';
import { STRINGS, type Lang } from './i18n';
import type { Category, DashboardResponse, Settings } from './types';

type CrawlStatus = { busy: boolean; message: string | null };

export function App() {
  const [lang, setLang] = useState<Lang>('ko');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [crawl, setCrawl] = useState<CrawlStatus>({ busy: false, message: null });
  const [showCatManager, setShowCatManager] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'todo' | 'published' | 'all'>('todo');
  const [role, setRole] = useState<Role>('admin');

  const t = STRINGS[lang];

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
    void fetchRole().then(setRole);
    void loadAll();
  }, []);

  const isAdmin = role === 'admin';

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

  async function toggleAck(seqId: string, current: boolean) {
    try {
      await fetch(`/api/source-articles/${seqId}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged: !current }),
      });
      await loadAll();
    } catch (err) {
      console.error('toggleAck failed', err);
    }
  }

  async function runBackfill() {
    const blogId = window.prompt('네이버 블로그 ID', 'lgeservice_kr');
    if (!blogId) return;
    const categoryNo = window.prompt(
      '카테고리 번호 (비우면 1..50 전체 카테고리 자동 순회)',
      '',
    );
    const maxPagesInput = window.prompt(
      categoryNo
        ? '최대 페이지 수 (기본 30)'
        : '카테고리당 최대 페이지 수 (기본 30)',
      '30',
    );
    const maxPages = Number(maxPagesInput) || 30;

    setCrawl({ busy: true, message: '시작 중…' });
    try {
      const res = await fetch('/api/backfill/naver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId,
          categoryNo: categoryNo || undefined,
          maxPages,
          maxCategoryNo: categoryNo ? undefined : 50,
        }),
      });
      const j = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(j.error ?? 'failed');

      // Single-category synchronous mode: response has totals immediately
      if (j.mode !== 'background' && categoryNo) {
        setCrawl({
          busy: false,
          message: `완료: 신규 ${j.added} · 갱신 ${j.updated} (총 ${j.fetched} 수집)`,
        });
        await loadAll();
        return;
      }

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
        <div className="lang-switch">
          <button
            className={lang === 'ko' ? 'active' : ''}
            onClick={() => setLang('ko')}
            type="button"
          >
            한국어
          </button>
          <button
            className={lang === 'en' ? 'active' : ''}
            onClick={() => setLang('en')}
            type="button"
          >
            English
          </button>
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
        {isAdmin && (
          <>
            <button
              onClick={runSyncAll}
              disabled={crawl.busy}
              type="button"
              className="primary-btn"
              title={t.actions.syncAllHint}
            >
              {t.actions.syncAll}
            </button>
            <button onClick={runBackfill} disabled={crawl.busy} type="button">
              {t.actions.backfillNaver}
            </button>
            <button onClick={() => setShowNotifPanel(true)} disabled={crawl.busy} type="button">
              {t.actions.notifications}
            </button>
            <button
              onClick={() => setShowCatManager(true)}
              disabled={crawl.busy}
              type="button"
              className="muted-btn"
            >
              {t.actions.manageCategories}
            </button>
          </>
        )}
        <button onClick={loadAll} disabled={crawl.busy} type="button" className="muted-btn">
          {t.actions.refresh}
        </button>
        {role === 'partner' && (
          <span className="role-pill">협력업체 모드</span>
        )}
        {crawl.message && <span className="status">{crawl.message}</span>}
      </section>

      {showCatManager && (
        <CategoryManager
          lang={lang}
          categories={categories}
          onClose={() => setShowCatManager(false)}
          onChanged={loadAll}
        />
      )}

      {showNotifPanel && (
        <NotificationsPanel lang={lang} onClose={() => setShowNotifPanel(false)} />
      )}

      <SeasonalPanel lang={lang} refreshKey={refreshKey} />

      {(() => {
        const allRows = dashboard?.rows ?? [];
        const isTodo = (r: typeof allRows[number]) =>
          r.effectiveStatus !== 'published' && !r.article.workflow?.acknowledged;
        const todoCount = allRows.filter(isTodo).length;
        const doneCount = allRows.length - todoCount;

        // Status priority for sort: requested > in_progress > review > pending > published
        const STATUS_PRIORITY: Record<string, number> = {
          requested: 0,
          in_progress: 1,
          review: 2,
          pending: 3,
          published: 4,
        };
        const filtered = allRows
          .filter((r) => {
            if (statusFilter === 'todo') return isTodo(r);
            if (statusFilter === 'published') return !isTodo(r);
            return true;
          })
          .slice()
          .sort((a, b) => {
            const dp = STATUS_PRIORITY[a.effectiveStatus] - STATUS_PRIORITY[b.effectiveStatus];
            if (dp !== 0) return dp;
            const da = a.article.publishedAt ?? '';
            const db = b.article.publishedAt ?? '';
            return db.localeCompare(da);
          });

        return (
          <section className="grid">
            <header className="dash-head">
              <h2>
                {t.todo.title}{' '}
                <span className="todo-count-pill">{t.todo.count(todoCount)}</span>
              </h2>
              <div className="filter-chips">
                <button
                  type="button"
                  className={statusFilter === 'todo' ? 'chip active' : 'chip'}
                  onClick={() => setStatusFilter('todo')}
                >
                  {t.todo.filterTodo} ({todoCount})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'published' ? 'chip active' : 'chip'}
                  onClick={() => setStatusFilter('published')}
                >
                  {t.todo.filterPublished} ({doneCount})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'all' ? 'chip active' : 'chip'}
                  onClick={() => setStatusFilter('all')}
                >
                  {t.todo.filterAll} ({allRows.length})
                </button>
              </div>
            </header>

            {filtered.length === 0 ? (
              <p className="empty">{t.empty.sources}</p>
            ) : (
              <table className="rows">
                <thead>
                  <tr>
                    <th>{t.cols.risk}</th>
                    <th>{t.cols.status}</th>
                    <th>{t.cols.title}</th>
                    <th>{t.cols.category}</th>
                    <th>{t.cols.published}</th>
                    <th>{t.cols.postLink}</th>
                    <th className="ack-th">{t.cols.ack}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const status = row.effectiveStatus;
                    const dangerous = row.risk.level === 'red';
                    const acked = !!row.article.workflow?.acknowledged;
                    return (
                      <tr
                        key={row.article.seqId}
                        className={dangerous ? 'row-dangerous' : acked ? 'row-acked' : ''}
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
                        <td>
                          <span className={`status-badge st-${status}`}>{t.status[status]}</span>
                        </td>
                        <td>
                          <a href={row.article.url} target="_blank" rel="noreferrer">
                            {row.article.title}
                          </a>
                          <div className="reason">{row.risk.reason}</div>
                          {row.article.workflow?.memo && (
                            <div className="memo">📝 {row.article.workflow.memo}</div>
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
                        <td className="ack-td">
                          <label className="ack-toggle" title={lang === 'ko' ? '확인 완료로 표시' : 'Mark as reviewed'}>
                            <input
                              type="checkbox"
                              checked={acked}
                              onChange={() => toggleAck(row.article.seqId, acked)}
                            />
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })()}

    </div>
  );
}
