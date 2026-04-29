import type { BlogPost, DedupHit, RiskAssessment, SourceArticle } from './types.js';

export function normalizeTitle(s: string): string {
  let t = s.toLowerCase();
  // Strip special chars
  t = t.replace(/[?!.,~\-_/\\()[\]{}'"`]/g, ' ');
  // Strip word-final particles BEFORE removing spaces, and only when the stem
  // (chars before the particle) is at least 2 chars. Prevents "자가" → "자".
  t = t.replace(
    /([\p{L}\p{N}]{2,})(은|는|이|가|을|를|의|에|에서|로|으로|와|과|도|만|좀)(?=\s|$)/gu,
    '$1',
  );
  // Now remove spaces
  t = t.replace(/\s+/g, '');
  return t;
}

// Aggressive normalization for fuzzy matching:
// - UNWRAP [bracket] groups so words inside (e.g. "자가점검") still count as content
// - strip LG / LG전자 / 엘지 / 엘지전자 brand prefixes
// - strip common SEO trailing patterns
// - then apply normalizeTitle
export function normalizeTitleFuzzy(s: string): string {
  let t = s;
  // Unwrap bracketed groups: keep content, replace brackets with spaces
  t = t.replace(/\[([^\]]*)\]/g, ' $1 ');
  t = t.replace(/【([^】]*)】/g, ' $1 ');
  // Drop pure metadata tags ([공지], [이벤트], etc) — surrounded by non-Korean chars
  t = t.replace(
    /(^|[^\p{Script=Hangul}])(공지|이벤트사항|알림|소식|뉴스)(?=[^\p{Script=Hangul}]|$)/gu,
    '$1 ',
  );
  // Strip brand mentions (now visible after unwrapping)
  t = t.replace(/lg\s*전자\s*서비스/gi, ' ');
  t = t.replace(/lg\s*전자/gi, ' ');
  t = t.replace(/엘지\s*전자/g, ' ');
  t = t.replace(/\blg\b/gi, ' ');
  t = t.replace(/엘지/g, ' ');
  // Strip common trailing patterns from blog (SEO) and LG (colloquial).
  // 주의: "해결 방법"은 종종 본 내용이라 그것만으로는 안 떼고, "이유 및" 같은 명백한 SEO 묶음이거나
  // 의문문 형태(은?)일 때만 떼어낸다.
  t = t.replace(
    /(이유\s*및\s*(조치|해결)\s*방법은?|이유\s*및\s*해결법|해결\s*방법은\s*\?|알아보기|총정리|확인하기|안내(?:\s*드림|드립니다)?|알려\s*주세요|궁금\s*해요|알고\s*싶어요|해\s*주세요|어떻게\s*하나요|어떻게\s*해야\s*하나요)\s*[?!.~]*\s*$/g,
    ' ',
  );
  // Strip standalone trailing question/exclamation
  t = t.replace(/[?!~]+\s*$/g, ' ');
  return normalizeTitle(t);
}

// Character bigrams for fuzzy similarity. Padded with spaces to capture word boundaries.
function getBigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) {
    out.add(padded.slice(i, i + 2));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

// Korean stopwords — tokens too common/conversational to be discriminating signals.
const STOPWORDS = new Set<string>([
  'lg', 'lg전자', '엘지', '엘지전자',
  '방법', '방법은', '방법을', '방법이', '방법으로', '방법까지',
  '이유', '대처', '조치', '해결', '안내', '확인', '체크', '살펴',
  '사용', '설정', '문제', '발생', '경우', '때', '관련', '에서', '동안', '함께',
  '있을', '있어요', '있는지', '있는', '있음', '없어요', '없을', '없는', '없음',
  '하는', '하지', '해도', '해서', '하면', '한다면', '한다', '합니다', '됩니다',
  '되나요', '될까요', '될', '되는', '되면', '하나요', '인가요', '되어',
  '제품', '모델', '제품의', '저희', '여러분', '고객', '고객님',
  '미리', '간단', '쉽게', '제대로', '이렇게', '저렇게', '한번', '한 번',
  '소개', '알려드립니다', '드립니다', '드려요', '드림', '드릴게요',
  // 콜로퀴얼 끝 표현
  '알고', '싶어요', '싶으세요', '싶다', '싶은', '알아요', '알아두', '알아두세요',
  '알아두면', '알면', '알면된다', '살펴봐요', '살펴보기', '살펴보세요', '살펴보면',
  '체크하기', '확인하기', '파악하기', '대해', '대한', '함께', '같이',
  '어떻게', '어떤', '어디', '왜', '무엇', '뭐', '어느',
  '기본', '특징', '차이', '비교', '종류', '유형', '꿀팁', '팁', '관리',
  '오늘', '여름', '겨울', '봄', '가을', '계절', '하루', '한주',
]);

// Strip a single trailing noun particle from a Korean token (NOT verb endings).
// e.g., "방법을" → "방법", "냉장고가" → "냉장고", "에어컨이" → "에어컨"
function stripTrailingParticle(t: string): string {
  return t.replace(/(은|는|이|가|을|를|의|에서|와|과)$/, '');
}

// Tokenize into Korean meaningful words: split, particle-strip, drop short, drop stopwords.
function meaningfulTokens(s: string): Set<string> {
  const out = new Set<string>();
  const cleaned = s.toLowerCase().replace(/[?!.,~\-_/\\()[\]{}'"`]/g, ' ');
  for (const raw of cleaned.split(/\s+/)) {
    if (raw.length < 2) continue;
    const t = stripTrailingParticle(raw);
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(t);
  }
  return out;
}

// "Containment" of smaller token set in larger — used as a permissive recall stage.
function tokenContainment(a: Set<string>, b: Set<string>): { sim: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { sim: 0, shared: 0 };
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const minSize = Math.min(a.size, b.size);
  return { sim: intersect / minSize, shared: intersect };
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

// Pre-compute lookup maps for the blog corpus so per-article assessment is fast.
// Pass the result as `index` to assessRisk to avoid O(n*m) work in batch calls.
export interface BlogIndex {
  bySourceSeq: Map<string, BlogPost>;
  byNormalizedTitle: Map<string, BlogPost[]>;
  fuzzyEntries: Array<{
    post: BlogPost;
    fuzzy: string;
    bigrams: Set<string>;
    tokens: Set<string>;
  }>;
  posts: BlogPost[];
}
export function buildBlogIndex(blogPosts: BlogPost[]): BlogIndex {
  const bySourceSeq = new Map<string, BlogPost>();
  const byNormalizedTitle = new Map<string, BlogPost[]>();
  const fuzzyEntries: BlogIndex['fuzzyEntries'] = [];
  for (const p of blogPosts) {
    if (p.sourceSeqId) bySourceSeq.set(p.sourceSeqId, p);
    const k = normalizeTitle(p.title);
    if (!byNormalizedTitle.has(k)) byNormalizedTitle.set(k, []);
    byNormalizedTitle.get(k)!.push(p);
    const fuzzy = normalizeTitleFuzzy(p.title);
    if (fuzzy.length >= 4) {
      // Unwrap brackets + strip brand from raw title for token extraction
      const tokenSrc = p.title
        .replace(/\[([^\]]*)\]/g, ' $1 ')
        .replace(
          /(^|[^\p{Script=Hangul}])(공지|이벤트사항|알림|소식|뉴스)(?=[^\p{Script=Hangul}]|$)/gu,
          '$1 ',
        )
        .replace(/lg\s*전자/gi, ' ')
        .replace(/lg/gi, ' ')
        .replace(/엘지\s*전자/g, ' ')
        .replace(/엘지/g, ' ');
      fuzzyEntries.push({
        post: p,
        fuzzy,
        bigrams: getBigrams(fuzzy),
        tokens: meaningfulTokens(tokenSrc),
      });
    }
  }
  return { bySourceSeq, byNormalizedTitle, fuzzyEntries, posts: blogPosts };
}

export function assessRisk(
  article: SourceArticle,
  blogPosts: BlogPost[],
  opts?: {
    cosineThreshold?: number;
    enableCosine?: boolean;
    index?: BlogIndex;
    fuzzyThreshold?: number; // bigram Jaccard threshold (default 0.55)
  },
): RiskAssessment {
  const cosineThreshold = opts?.cosineThreshold ?? 0.8;
  const fuzzyThreshold = opts?.fuzzyThreshold ?? 0.35;
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

  // Stage 2a: strict normalized title match
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

  // Stage 2b: fuzzy matching — combines:
  //   (i)   substring containment after aggressive normalization
  //   (ii)  bigram Jaccard >= fuzzyThreshold (default 0.35)
  //   (iii) shared meaningful Korean tokens (>=3 shared, containment >=0.5)
  // Stage (iii) catches paraphrased blog titles where the editor uses different
  // verb endings or sentence framing but keeps the same meaningful nouns.
  const targetFuzzy = normalizeTitleFuzzy(article.title);
  if (targetFuzzy.length >= 4) {
    const targetBigrams = getBigrams(targetFuzzy);
    const targetTokenSrc = article.title
      .replace(/\[([^\]]*)\]/g, ' $1 ')
      .replace(/\b(공지|이벤트|안내|알림|소식|뉴스)\b/g, ' ')
      .replace(/lg\s*전자/gi, ' ')
      .replace(/lg/gi, ' ')
      .replace(/엘지\s*전자/g, ' ')
      .replace(/엘지/g, ' ');
    const targetTokens = meaningfulTokens(targetTokenSrc);

    for (const entry of index.fuzzyEntries) {
      if (hits.some((h) => h.blogPost.postId === entry.post.postId)) continue;

      // (i) substring containment first (cheap)
      let sim: number | null = null;
      if (entry.fuzzy.includes(targetFuzzy) || targetFuzzy.includes(entry.fuzzy)) {
        sim = 1.0;
      } else {
        // (ii) bigram Jaccard
        const j = jaccard(targetBigrams, entry.bigrams);
        if (j >= fuzzyThreshold) sim = j;

        // (iii) token overlap — catches paraphrases when bigram fails.
        if (sim === null && targetTokens.size >= 2 && entry.tokens.size >= 2) {
          const tc = tokenContainment(targetTokens, entry.tokens);
          if (tc.shared >= 3) sim = 0.5;
          // 2 shared meaningful tokens, but require both titles to be tight (<=5 tokens)
          // AND at least one shared token to be substantive (>= 3 chars).
          else if (
            tc.shared >= 2 &&
            Math.max(targetTokens.size, entry.tokens.size) <= 5
          ) {
            const sharedTokens = [...targetTokens].filter((x) => entry.tokens.has(x));
            const hasSubstantive = sharedTokens.some((x) => x.length >= 3);
            if (hasSubstantive) sim = 0.4;
          }
        }
      }

      if (sim !== null) {
        hits.push({
          kind: 'title_fuzzy',
          blogPost: entry.post,
          similarity: sim,
          daysSincePublished: daysSince(entry.post.publishedAt),
        });
      }
    }
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
