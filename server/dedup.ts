import type { BlogPost, DedupHit, RiskAssessment, SourceArticle } from './types.js';

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[?!.,~\-_/\\()[\]{}'"`]/g, '')
    .replace(/(은|는|이|가|을|를|의|에|에서|로|으로|와|과|도|만|좀)/g, '');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export function cosineSimilarity(a: string, b: string): number {
  const ta = termFreq(tokenize(a));
  const tb = termFreq(tokenize(b));
  let dot = 0;
  for (const [tok, va] of ta) {
    const vb = tb.get(tok);
    if (vb) dot += va * vb;
  }
  let na = 0;
  for (const v of ta.values()) na += v * v;
  let nb = 0;
  for (const v of tb.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// Pre-compute lookup maps for the blog corpus so per-article assessment is O(1).
// Pass the result as `index` to assessRisk to avoid O(n*m) work in batch calls.
export interface BlogIndex {
  bySourceSeq: Map<string, BlogPost>;
  byNormalizedTitle: Map<string, BlogPost[]>;
  posts: BlogPost[];
}
export function buildBlogIndex(blogPosts: BlogPost[]): BlogIndex {
  const bySourceSeq = new Map<string, BlogPost>();
  const byNormalizedTitle = new Map<string, BlogPost[]>();
  for (const p of blogPosts) {
    if (p.sourceSeqId) bySourceSeq.set(p.sourceSeqId, p);
    const k = normalizeTitle(p.title);
    if (!byNormalizedTitle.has(k)) byNormalizedTitle.set(k, []);
    byNormalizedTitle.get(k)!.push(p);
  }
  return { bySourceSeq, byNormalizedTitle, posts: blogPosts };
}

export function assessRisk(
  article: SourceArticle,
  blogPosts: BlogPost[],
  opts?: { cosineThreshold?: number; enableCosine?: boolean; index?: BlogIndex },
): RiskAssessment {
  const cosineThreshold = opts?.cosineThreshold ?? 0.8;
  // Cosine over the full blog corpus is O(n*m); skipped by default for dashboard.
  // Pass enableCosine: true for explicit duplicate-search workflows.
  const enableCosine = opts?.enableCosine ?? false;
  const index = opts?.index ?? buildBlogIndex(blogPosts);
  const hits: DedupHit[] = [];

  // Stage 1: seq_id mapping (definitive)
  const seqMatch = index.bySourceSeq.get(article.seqId);
  if (seqMatch) {
    hits.push({
      kind: 'seq_id',
      blogPost: seqMatch,
      daysSincePublished: daysSince(seqMatch.publishedAt),
    });
  }

  // Stage 2: normalized title match
  const targetNorm = normalizeTitle(article.title);
  const titleMatches = index.byNormalizedTitle.get(targetNorm) ?? [];
  for (const p of titleMatches) {
    if (hits.some((h) => h.blogPost.postId === p.postId)) continue;
    hits.push({
      kind: 'title_normalized',
      blogPost: p,
      daysSincePublished: daysSince(p.publishedAt),
    });
  }

  // Stage 3: body cosine similarity (opt-in only — slow at scale)
  if (enableCosine) {
    const corpus = `${article.title} ${article.bodySummary}`;
    for (const p of blogPosts) {
      if (hits.some((h) => h.blogPost.postId === p.postId)) continue;
      const sim = cosineSimilarity(corpus, p.title);
      if (sim >= cosineThreshold) {
        hits.push({
          kind: 'body_cosine',
          blogPost: p,
          similarity: sim,
          daysSincePublished: daysSince(p.publishedAt),
        });
      }
    }
  }

  if (hits.length === 0) {
    return { level: 'none', reason: '중복 없음', hits: [] };
  }

  // Risk level by recency of most-recent hit
  const recencies = hits
    .map((h) => h.daysSincePublished)
    .filter((d): d is number => d !== null);
  const minDays = recencies.length > 0 ? Math.min(...recencies) : null;

  let level: RiskAssessment['level'] = 'green';
  let reason = '180일 이상 지난 글 — 재발행 검토 가능';
  if (minDays === null) {
    level = 'yellow';
    reason = '게시일 미상 — 수동 확인 필요';
  } else if (minDays <= 30) {
    level = 'red';
    reason = `${minDays}일 전에 동일 글이 게시됨 — 발행 금지`;
  } else if (minDays <= 90) {
    level = 'red';
    reason = `${minDays}일 전 게시 — 영구 정지 위험`;
  } else if (minDays <= 180) {
    level = 'yellow';
    reason = `${minDays}일 전 게시 — 신중 검토`;
  }

  return { level, reason, hits };
}
