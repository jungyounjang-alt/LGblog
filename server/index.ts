import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crawlAllCategories,
  crawlSubcategory,
  discoverSubcategories,
} from './crawlers/lge.js';
import { backfillNaverBlog, backfillSingleCategory } from './crawlers/naverBlog.js';
import { assessRisk, buildBlogIndex } from './dedup.js';
import {
  emit as emitNotification,
  getRecentNotifications,
  getSettings as getNotificationSettings,
  saveSettings as saveNotificationSettings,
} from './notifications.js';
import { buildSeasonal } from './seasonal.js';
import { store, upsertBlogPosts, upsertSourceArticles } from './store.js';
import type { BlogPost, WorkflowState, WorkflowStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_STATUSES: WorkflowStatus[] = [
  'pending',
  'requested',
  'in_progress',
  'review',
  'published',
];

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/api/categories', async (_req, res) => {
  res.json(await store.getCategories());
});

// 서브카테고리 추가 — 사용자가 LG 사이트에서 URL 보고 등록
app.post('/api/categories/:categoryId/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { id, productCode, nameKo, nameEn } = req.body ?? {};
    if (!id || !productCode || !nameKo) {
      return res.status(400).json({ error: 'id, productCode, nameKo are required' });
    }
    const cats = await store.getCategories();
    const cat = cats.find((c) => c.id === categoryId);
    if (!cat) return res.status(404).json({ error: 'category not found' });
    if (cat.subcategories.some((s) => s.id === id)) {
      return res.status(409).json({ error: 'subcategory already exists' });
    }
    cat.subcategories.push({ id, productCode, nameKo, nameEn: nameEn ?? nameKo });
    await store.saveCategories(cats);
    res.json({ ok: true, subcategory: { id, productCode, nameKo, nameEn: nameEn ?? nameKo } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 서브카테고리 삭제
app.delete('/api/categories/:categoryId/subcategories/:subId', async (req, res) => {
  try {
    const cats = await store.getCategories();
    const cat = cats.find((c) => c.id === req.params.categoryId);
    if (!cat) return res.status(404).json({ error: 'category not found' });
    const before = cat.subcategories.length;
    cat.subcategories = cat.subcategories.filter((s) => s.id !== req.params.subId);
    if (cat.subcategories.length === before) {
      return res.status(404).json({ error: 'subcategory not found' });
    }
    await store.saveCategories(cats);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/source-articles', async (_req, res) => {
  res.json(await store.getSourceArticles());
});

app.get('/api/blog-posts', async (_req, res) => {
  res.json(await store.getBlogPosts());
});

// 백필 데이터에서 발견된 Naver categoryNo 분포
app.get('/api/blog-posts/categories', async (_req, res) => {
  const posts = await store.getBlogPosts();
  const counts = new Map<string, number>();
  for (const p of posts) {
    const k = p.categoryNo ?? '(없음)';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = [...counts.entries()]
    .map(([categoryNo, count]) => ({ categoryNo, count }))
    .sort((a, b) => b.count - a.count);
  res.json(out);
});

app.get('/api/settings', async (_req, res) => {
  res.json(await store.getSettings());
});

// 알림 설정 / 로그
app.get('/api/notifications/settings', async (_req, res) => {
  res.json(await getNotificationSettings());
});

app.put('/api/notifications/settings', async (req, res) => {
  const next = await saveNotificationSettings(req.body ?? {});
  res.json(next);
});

app.get('/api/notifications', async (req, res) => {
  const limit = Number(req.query.limit ?? 30);
  res.json(await getRecentNotifications(limit));
});

app.get('/api/seasonal', async (_req, res) => {
  const blogPosts = await store.getBlogPosts();
  res.json(buildSeasonal(blogPosts));
});

// 대시보드 통계: 카테고리별 발행 건수 + 인기 콘텐츠
app.get('/api/stats', async (_req, res) => {
  const [articles, blogPosts, categories] = await Promise.all([
    store.getSourceArticles(),
    store.getBlogPosts(),
    store.getCategories(),
  ]);
  const blogIndex = buildBlogIndex(blogPosts);

  // 1) Build blog post → LG category map.
  //    Priority: confirmed sourceSeqId mapping > auto-match (any title hit)
  const articleById = new Map(articles.map((a) => [a.seqId, a]));
  const blogToCategoryId = new Map<string, string>(); // postId → categoryId

  // confirmed
  for (const p of blogPosts) {
    if (p.sourceSeqId && articleById.has(p.sourceSeqId)) {
      blogToCategoryId.set(p.postId, articleById.get(p.sourceSeqId)!.categoryId);
    }
  }
  // auto-match (any title hit)
  for (const a of articles) {
    if (blogToCategoryId.size >= blogPosts.length) break;
    const risk = assessRisk(a, blogPosts, { index: blogIndex });
    for (const h of risk.hits) {
      if (!blogToCategoryId.has(h.blogPost.postId)) {
        blogToCategoryId.set(h.blogPost.postId, a.categoryId);
      }
    }
  }

  function rankByCategory(filter?: (b: BlogPost) => boolean) {
    const counts = new Map<string, number>();
    let unmapped = 0;
    for (const p of blogPosts) {
      if (filter && !filter(p)) continue;
      const cid = blogToCategoryId.get(p.postId);
      if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
      else unmapped++;
    }
    const ranked = [...counts.entries()]
      .map(([id, count]) => {
        const cat = categories.find((c) => c.id === id);
        return { categoryId: id, nameKo: cat?.nameKo ?? id, count };
      })
      .sort((a, b) => b.count - a.count);
    return { ranked, unmapped };
  }

  const now = Date.now();
  const day = 86400 * 1000;
  function within(p: BlogPost, days: number): boolean {
    if (!p.publishedAt) return false;
    return now - Date.parse(p.publishedAt) <= days * day;
  }

  const allCategoryRank = rankByCategory();
  const last30CategoryRank = {
    ranked: rankByCategory((p) => within(p, 30)).ranked.slice(0, 5),
    unmapped: rankByCategory((p) => within(p, 30)).unmapped,
  };
  const last90CategoryRank = {
    ranked: rankByCategory((p) => within(p, 90)).ranked.slice(0, 5),
    unmapped: rankByCategory((p) => within(p, 90)).unmapped,
  };

  // Top viewed LG articles (substitute for blog views — blog viewing data not available)
  function parseView(v: string | null): number {
    if (!v) return 0;
    return Number(v.replace(/,/g, '')) || 0;
  }
  const topByView = (limit: number) =>
    articles
      .filter((a) => parseView(a.view) > 0)
      .sort((a, b) => parseView(b.view) - parseView(a.view))
      .slice(0, limit)
      .map((a) => {
        const confirmed = blogIndex.bySourceSeq.get(a.seqId) ?? null;
        const fallback =
          !confirmed
            ? assessRisk(a, blogPosts, { index: blogIndex }).hits[0]?.blogPost ?? null
            : null;
        const matched = confirmed ?? fallback;
        return {
          article: { seqId: a.seqId, title: a.title, url: a.url, cateName: a.cateName },
          view: parseView(a.view),
          matchedBlogPost: matched
            ? { title: matched.title, url: matched.url, publishedAt: matched.publishedAt }
            : null,
        };
      });

  res.json({
    categoryRank: {
      all: allCategoryRank,
      last30: last30CategoryRank,
      last90: last90CategoryRank,
    },
    topViewed: topByView(5),
    blogViewsAvailable: false,
    totals: {
      blogPosts: blogPosts.length,
      mapped: blogToCategoryId.size,
      unmapped: blogPosts.length - blogToCategoryId.size,
    },
  });
});

app.post('/api/notifications/test', async (_req, res) => {
  const n = await emitNotification({
    kind: 'publish_request',
    title: '[테스트] 알림 전송 확인',
    body: '이 메시지가 보이면 webhook 설정이 정상입니다.',
    link: null,
  });
  res.json(n);
});

// In-memory job state for sync-all (single-user MVP)
interface SyncJob {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  step: string;
  progress: { done: number; total: number };
  totals: { discovered: number; fetched: number; added: number; updated: number };
  error: string | null;
}
let syncJob: SyncJob = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  step: '',
  progress: { done: 0, total: 0 },
  totals: { discovered: 0, fetched: 0, added: 0, updated: 0 },
  error: null,
};

async function runSyncAll(): Promise<void> {
  syncJob = {
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    step: '서브카테고리 자동 발견 중',
    progress: { done: 0, total: 0 },
    totals: { discovered: 0, fetched: 0, added: 0, updated: 0 },
    error: null,
  };
  try {
    const cats = await store.getCategories();
    let discovered = 0;
    syncJob.progress = { done: 0, total: cats.length };
    for (const cat of cats) {
      const found = await discoverSubcategories(cat.id);
      const existingIds = new Set(cat.subcategories.map((s) => s.id));
      for (const sub of found) {
        if (!existingIds.has(sub.code)) {
          cat.subcategories.push({
            id: sub.code,
            productCode: '',
            nameKo: sub.name,
            nameEn: sub.name,
          });
          discovered++;
        }
      }
      syncJob.progress.done++;
      syncJob.totals.discovered = discovered;
    }
    await store.saveCategories(cats);

    // Crawl each subcategory and persist progressively
    const allSubs = cats.flatMap((c) =>
      c.subcategories.map((s) => ({
        categoryId: c.id,
        subcategoryId: s.id,
        nameKo: s.nameKo,
      })),
    );
    syncJob.step = '글 크롤 중';
    syncJob.progress = { done: 0, total: allSubs.length };

    for (const sub of allSubs) {
      try {
        const items = await crawlSubcategory({
          categoryId: sub.categoryId,
          subcategoryId: sub.subcategoryId,
        });
        if (items.length > 0) {
          const r = await upsertSourceArticles(items);
          syncJob.totals.fetched += items.length;
          syncJob.totals.added += r.added;
          syncJob.totals.updated += r.updated;
        }
      } catch (err) {
        // continue on individual subcategory failure
        console.warn(`[sync-all] failed sub=${sub.subcategoryId}:`, (err as Error).message);
      }
      syncJob.progress.done++;
    }

    const settings = await store.getSettings();
    await store.saveSettings({ ...settings, lastSourceCrawlAt: new Date().toISOString() });

    syncJob.state = 'done';
    syncJob.step = '완료';
    syncJob.finishedAt = new Date().toISOString();
  } catch (err) {
    syncJob.state = 'error';
    syncJob.error = (err as Error).message;
    syncJob.finishedAt = new Date().toISOString();
  }
}

app.post('/api/sync-all', (_req, res) => {
  if (syncJob.state === 'running') {
    return res.status(409).json({ error: 'already running', job: syncJob });
  }
  // Fire & forget
  void runSyncAll();
  res.json({ ok: true, job: syncJob });
});

app.get('/api/sync-all/status', (_req, res) => {
  res.json(syncJob);
});

// LG 스스로 해결 크롤 — 단일 서브카테고리 (PoC) 또는 전체
app.post('/api/crawl/lge', async (req, res) => {
  try {
    const { categoryId, subcategoryId, productCode, maxPages } = req.body ?? {};
    let articles;
    if (categoryId && subcategoryId && productCode) {
      articles = await crawlSubcategory({ categoryId, subcategoryId, productCode, maxPages });
    } else {
      const cats = await store.getCategories();
      articles = await crawlAllCategories(cats);
    }
    const result = await upsertSourceArticles(articles);
    const settings = await store.getSettings();
    await store.saveSettings({ ...settings, lastSourceCrawlAt: new Date().toISOString() });
    res.json({ fetched: articles.length, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 네이버 블로그 백필 — categoryNo 지정 시 단일, 생략 시 1..maxCategoryNo 자동 순회
// 전체 모드는 백그라운드 잡 + progressive save (한 카테고리 끝날 때마다 저장)
interface BackfillJob {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  progress: { done: number; total: number };
  totals: { fetched: number; added: number; updated: number };
  error: string | null;
}
let backfillJob: BackfillJob = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  progress: { done: 0, total: 0 },
  totals: { fetched: 0, added: 0, updated: 0 },
  error: null,
};

async function runBackfillAll(blogId: string, maxPages: number, maxCategoryNo: number) {
  backfillJob = {
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: { done: 0, total: maxCategoryNo },
    totals: { fetched: 0, added: 0, updated: 0 },
    error: null,
  };
  try {
    for (let n = 1; n <= maxCategoryNo; n++) {
      try {
        const items = await backfillSingleCategory({
          blogId,
          categoryNo: String(n),
          maxPages,
        });
        if (items.length > 0) {
          const r = await upsertBlogPosts(items);
          backfillJob.totals.fetched += items.length;
          backfillJob.totals.added += r.added;
          backfillJob.totals.updated += r.updated;
        }
      } catch (err) {
        console.warn(`[backfill] cat=${n} failed:`, (err as Error).message);
      }
      backfillJob.progress.done++;
    }
    const settings = await store.getSettings();
    await store.saveSettings({ ...settings, lastBackfillAt: new Date().toISOString() });
    backfillJob.state = 'done';
    backfillJob.finishedAt = new Date().toISOString();
  } catch (err) {
    backfillJob.state = 'error';
    backfillJob.error = (err as Error).message;
    backfillJob.finishedAt = new Date().toISOString();
  }
}

app.post('/api/backfill/naver', async (req, res) => {
  try {
    const { blogId, categoryNo, maxPages, maxCategoryNo } = req.body ?? {};
    if (!blogId) return res.status(400).json({ error: 'blogId is required' });

    // Single-category mode: synchronous (small)
    if (categoryNo) {
      const posts = await backfillNaverBlog({ blogId, categoryNo, maxPages });
      const result = await upsertBlogPosts(posts);
      const settings = await store.getSettings();
      await store.saveSettings({ ...settings, lastBackfillAt: new Date().toISOString() });
      return res.json({ fetched: posts.length, ...result });
    }

    // All-categories mode: background job
    if (backfillJob.state === 'running') {
      return res.status(409).json({ error: 'already running', job: backfillJob });
    }
    void runBackfillAll(blogId, maxPages ?? 30, maxCategoryNo ?? 50);
    res.json({ ok: true, mode: 'background', job: backfillJob });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/backfill/naver/status', (_req, res) => {
  res.json(backfillJob);
});

// 한 번에 source 글에 블로그 글 매핑 (URL 붙여넣기 or 자동 매칭 확정)
// 입력: { url? } | { postId? }   (둘 중 하나)
app.post('/api/source-articles/:seqId/link-blog', async (req, res) => {
  try {
    const { seqId } = req.params;
    const { url, postId } = (req.body ?? {}) as { url?: string; postId?: string };

    const articles = await store.getSourceArticles();
    const article = articles.find((a) => a.seqId === seqId);
    if (!article) return res.status(404).json({ error: 'article not found' });

    const posts = await store.getBlogPosts();
    let target: BlogPost | undefined;
    let mode: 'confirm' | 'create' | 'reuse';

    if (postId) {
      target = posts.find((p) => p.postId === postId);
      if (!target) return res.status(404).json({ error: 'blog post not found' });
      mode = 'confirm';
    } else if (url) {
      const m = url.match(/lgeservice_kr\/(\d+)/) ?? url.match(/logNo=(\d+)/);
      if (!m) return res.status(400).json({ error: 'cannot extract postId from url' });
      const newId = m[1];
      target = posts.find((p) => p.postId === newId);
      if (target) {
        mode = 'reuse';
      } else {
        const fresh: BlogPost = {
          postId: newId,
          title: article.title,
          url,
          publishedAt: new Date().toISOString().slice(0, 10),
          categoryNo: null,
          categoryNameKo: null,
          sourceSeqId: seqId,
          assignedTo: article.workflow?.assignee ?? null,
          addedAt: new Date().toISOString(),
          source: 'manual',
        };
        posts.push(fresh);
        target = fresh;
        mode = 'create';
      }
    } else {
      return res.status(400).json({ error: 'url or postId required' });
    }

    // Clear any other post that previously mapped to this source
    for (const p of posts) {
      if (p.sourceSeqId === seqId && p.postId !== target.postId) p.sourceSeqId = null;
    }
    target.sourceSeqId = seqId;
    if (!target.assignedTo && article.workflow?.assignee) {
      target.assignedTo = article.workflow.assignee;
    }
    await store.saveBlogPosts(posts);

    void emitNotification({
      kind: 'publish_completed',
      title: `발행 완료: ${article.title}`,
      body:
        (target.assignedTo ? `담당: ${target.assignedTo}\n` : '') +
        `블로그 URL: ${target.url}\n원본: ${article.url}\n(${mode === 'confirm' ? '자동 매칭 확정' : mode === 'reuse' ? '기존 글 재매핑' : '신규 등록'})`,
      link: target.url,
    });

    res.json({ ok: true, post: target, mode });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 매핑 해제 (블로그 글 자체는 삭제하지 않고 sourceSeqId만 비움)
app.put('/api/source-articles/:seqId/unlink-blog', async (req, res) => {
  try {
    const { seqId } = req.params;
    const posts = await store.getBlogPosts();
    let cleared = 0;
    for (const p of posts) {
      if (p.sourceSeqId === seqId) {
        p.sourceSeqId = null;
        cleared++;
      }
    }
    await store.saveBlogPosts(posts);
    res.json({ ok: true, cleared });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 협력업체가 발행 후 블로그 URL 등록
app.post('/api/blog-posts/manual', async (req, res) => {
  try {
    const body = req.body as Partial<BlogPost> & { url?: string };
    if (!body.url) return res.status(400).json({ error: 'url is required' });
    const m = body.url.match(/lgeservice_kr\/(\d+)/);
    if (!m) return res.status(400).json({ error: 'cannot extract postId from url' });
    const postId = m[1];
    const post: BlogPost = {
      postId,
      title: body.title ?? '',
      url: body.url,
      publishedAt: body.publishedAt ?? new Date().toISOString().slice(0, 10),
      categoryNo: body.categoryNo ?? null,
      categoryNameKo: body.categoryNameKo ?? null,
      sourceSeqId: body.sourceSeqId ?? null,
      assignedTo: body.assignedTo ?? null,
      addedAt: new Date().toISOString(),
      source: 'manual',
    };
    await upsertBlogPosts([post]);

    if (post.sourceSeqId) {
      const articles = await store.getSourceArticles();
      const src = articles.find((a) => a.seqId === post.sourceSeqId);
      void emitNotification({
        kind: 'publish_completed',
        title: `발행 완료: ${post.title || src?.title || post.url}`,
        body:
          (post.assignedTo ? `담당: ${post.assignedTo}\n` : '') +
          `블로그 URL: ${post.url}\n` +
          (src ? `원본: ${src.url}` : ''),
        link: post.url,
      });
    }

    res.json({ ok: true, post });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Source article의 workflow 필드 부분 업데이트
app.put('/api/source-articles/:seqId/workflow', async (req, res) => {
  try {
    const { seqId } = req.params;
    const patch = req.body ?? {};
    if (patch.status && !VALID_STATUSES.includes(patch.status)) {
      return res.status(400).json({ error: `invalid status: ${patch.status}` });
    }

    const articles = await store.getSourceArticles();
    const idx = articles.findIndex((a) => a.seqId === seqId);
    if (idx === -1) return res.status(404).json({ error: 'article not found' });

    const now = new Date().toISOString();
    const prev: WorkflowState = articles[idx].workflow ?? {
      status: 'pending',
      assignee: null,
      memo: null,
      requestedAt: null,
      updatedAt: now,
    };
    const next: WorkflowState = {
      status: patch.status ?? prev.status,
      assignee: patch.assignee !== undefined ? patch.assignee : prev.assignee,
      memo: patch.memo !== undefined ? patch.memo : prev.memo,
      requestedAt:
        patch.status === 'requested' && prev.status !== 'requested'
          ? now
          : prev.requestedAt,
      updatedAt: now,
      acknowledged:
        patch.acknowledged !== undefined ? !!patch.acknowledged : prev.acknowledged,
    };
    articles[idx] = { ...articles[idx], workflow: next };
    await store.saveSourceArticles(articles);

    // Fire notification on transition into 'requested'
    if (next.status === 'requested' && prev.status !== 'requested') {
      const a = articles[idx];
      const assigneeLabel = next.assignee ? `[${next.assignee}] ` : '';
      void emitNotification({
        kind: 'publish_request',
        title: `${assigneeLabel}블로그 발행 요청: ${a.title}`,
        body:
          `카테고리: ${a.cateName}\n원본 게시일: ${a.publishedAt ?? '-'}\n` +
          (next.memo ? `메모: ${next.memo}\n` : '') +
          `원본 URL: ${a.url}`,
        link: a.url,
      });
    }

    res.json({ ok: true, workflow: next });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 대시보드용 통합 뷰: 위험도 + workflow 상태 + 매칭된 블로그 포스트 포함
app.get('/api/dashboard', async (_req, res) => {
  const [articles, blogPosts] = await Promise.all([
    store.getSourceArticles(),
    store.getBlogPosts(),
  ]);
  const blogIndex = buildBlogIndex(blogPosts);
  const rows = articles.map((a) => {
    const publishedBlogPost = blogIndex.bySourceSeq.get(a.seqId) ?? null;
    const risk = assessRisk(a, blogPosts, { index: blogIndex });
    // Strict match wins; fuzzy match only if no strict match.
    const strictHit = risk.hits.find((h) => h.kind === 'title_normalized');
    const fuzzyHit = !strictHit
      ? risk.hits
          .filter((h) => h.kind === 'title_fuzzy')
          .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))[0]
      : undefined;
    const titleMatchHit = strictHit ?? fuzzyHit;
    const matchedPost: BlogPost | null =
      publishedBlogPost ?? titleMatchHit?.blogPost ?? null;
    const matchSource: 'confirmed' | 'title_match' | null = publishedBlogPost
      ? 'confirmed'
      : titleMatchHit
      ? 'title_match'
      : null;
    const effectiveStatus: WorkflowStatus = publishedBlogPost
      ? 'published'
      : (a.workflow?.status ?? 'pending');
    return {
      article: a,
      risk,
      effectiveStatus,
      publishedBlogPost,
      matchedPost,
      matchSource,
    };
  });
  rows.sort((x, y) => {
    const dx = x.article.publishedAt ?? '';
    const dy = y.article.publishedAt ?? '';
    return dy.localeCompare(dx);
  });
  res.json({ rows, totals: { articles: articles.length, blogPosts: blogPosts.length } });
});

// Production: serve the built React app from dist/
if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  const mode = process.env.DATABASE_URL ? 'postgres' : 'json-files';
  console.log(`[api] listening on http://localhost:${PORT}  storage=${mode}`);
});
