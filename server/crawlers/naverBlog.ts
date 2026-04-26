import axios from 'axios';
import * as cheerio from 'cheerio';
import type { BlogPost } from '../types.js';

const NAVER_BASE = 'https://blog.naver.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REQUEST_DELAY_MS = 2500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface NaverPostMeta {
  postId: string;
  title: string;
  publishedAt: string | null;
  categoryNo: string | null;
}

function parseNaverDate(raw: string): string | null {
  // "2026. 4. 23." -> "2026-04-23"
  const m = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchPostListPage(args: {
  blogId: string;
  categoryNo?: string;
  page: number;
}): Promise<{ posts: NaverPostMeta[]; hasNext: boolean }> {
  const params = new URLSearchParams({
    blogId: args.blogId,
    from: 'postList',
    currentPage: String(args.page),
  });
  if (args.categoryNo) params.set('categoryNo', args.categoryNo);

  const url = `${NAVER_BASE}/PostList.naver?${params.toString()}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: `${NAVER_BASE}/${args.blogId}`,
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);
  const posts: NaverPostMeta[] = [];

  // Each post sits in <li class="item"> with <a class="link"> wrapping
  // <strong class="title"> and <span class="date">.  logNo is in the href.
  $('li.item').each((_, el) => {
    const $li = $(el);
    const href = $li.find('a.link').attr('href') || '';
    const m = href.match(/logNo=(\d+)/);
    if (!m) return;
    const postId = m[1];
    const title = $li.find('strong.title').text().replace(/\s+/g, ' ').trim();
    if (!title) return;
    const dateRaw = $li.find('span.date').first().text().trim();
    const publishedAt = parseNaverDate(dateRaw);
    const catMatch = href.match(/categoryNo=(\d+)/);
    const categoryNo = catMatch ? catMatch[1] : null;
    posts.push({ postId, title, publishedAt, categoryNo });
  });

  // Dedup by postId
  const seen = new Set<string>();
  const unique = posts.filter((p) => {
    if (seen.has(p.postId)) return false;
    seen.add(p.postId);
    return true;
  });

  const hasNext = unique.length > 0;
  return { posts: unique, hasNext };
}

export async function backfillSingleCategory(args: {
  blogId: string;
  categoryNo: string;
  maxPages: number;
}): Promise<BlogPost[]> {
  const out: BlogPost[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  for (let page = 1; page <= args.maxPages; page++) {
    const { posts, hasNext } = await fetchPostListPage({
      blogId: args.blogId,
      categoryNo: args.categoryNo,
      page,
    });
    let newOnPage = 0;
    for (const meta of posts) {
      if (seen.has(meta.postId)) continue;
      seen.add(meta.postId);
      newOnPage++;
      out.push({
        postId: meta.postId,
        title: meta.title,
        url: `${NAVER_BASE}/${args.blogId}/${meta.postId}`,
        publishedAt: meta.publishedAt,
        categoryNo: meta.categoryNo ?? args.categoryNo,
        categoryNameKo: null,
        sourceSeqId: null,
        assignedTo: null,
        addedAt: now,
        source: 'backfill_naver',
      });
    }
    if (!hasNext || newOnPage === 0) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return out;
}

/**
 * Single-call backfill.
 * - If `categoryNo` is provided: backfill only that category.
 * - If `categoryNo` is omitted: probe categoryNo from 1 to `maxCategoryNo`.
 *
 * NOTE: this returns all posts at once. For all-categories mode the route
 * handler runs the loop itself so it can save per-category (progressive).
 */
export async function backfillNaverBlog(args: {
  blogId: string;
  categoryNo?: string;
  maxPages?: number;
  maxCategoryNo?: number;
}): Promise<BlogPost[]> {
  const maxPages = args.maxPages ?? 30;
  if (args.categoryNo) {
    return backfillSingleCategory({ blogId: args.blogId, categoryNo: args.categoryNo, maxPages });
  }
  const out: BlogPost[] = [];
  const seen = new Set<string>();
  const maxCat = args.maxCategoryNo ?? 50;
  for (let n = 1; n <= maxCat; n++) {
    const items = await backfillSingleCategory({ blogId: args.blogId, categoryNo: String(n), maxPages });
    for (const p of items) {
      if (seen.has(p.postId)) continue;
      seen.add(p.postId);
      out.push(p);
    }
    if (items.length > 0) await sleep(REQUEST_DELAY_MS);
  }
  return out;
}

