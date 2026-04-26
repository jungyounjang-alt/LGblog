import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Category, SourceArticle } from '../types.js';

const LGE_BASE = 'https://www.lge.co.kr';
const LIST_ENDPOINT = `${LGE_BASE}/support/solutions/searchSolutionsList.lgajax`;
const SUBCAT_ENDPOINT = `${LGE_BASE}/support/selectTwoCategoryList.lgajax`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REQUEST_DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DiscoveredSubcategory {
  code: string;
  name: string;
}

export async function discoverSubcategories(parentCategoryId: string): Promise<DiscoveredSubcategory[]> {
  const params = new URLSearchParams({
    cateSelect: parentCategoryId,
    menuCode: 'B00013',
  });
  const res = await axios.post<{ data: DiscoveredSubcategory[]; status: string }>(
    SUBCAT_ENDPOINT,
    params.toString(),
    {
      headers: {
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${LGE_BASE}/support/solutions`,
      },
      timeout: 15000,
    },
  );
  return res.data?.data ?? [];
}

interface ListItem {
  date: string;
  video: boolean;
  title: string;
  cateName: string;
  sympSubName: string;
  content: string;
  url: string;
  sympCodeThree: string;
  view: string;
  topic: string;
  seq: number;
}

interface ListResponse {
  data: {
    listData: ListItem[];
    listPage: { page: number; totalCount: number };
  };
  status: string;
}

function extractSeqId(url: string): string | null {
  const m = url.match(/solutions-(\d+)/);
  return m ? m[1] : null;
}

async function fetchListPage(args: {
  category: string;
  subCategory: string;
  productCode?: string;
  page: number;
}): Promise<ListResponse> {
  const params = new URLSearchParams({
    category: args.category,
    subCategory: args.subCategory,
    productCode: args.productCode ?? '',
    modelCode: '',
    topic: '',
    subTopic: '',
    sympCodeThree: '',
    pageCode: 'B00013',
    isMyProduct: 'N',
    preLoad: 'Y',
    sort: 'update',
    page: String(args.page),
  });
  const res = await axios.post<ListResponse>(LIST_ENDPOINT, params.toString(), {
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${LGE_BASE}/support/solutions`,
    },
    timeout: 15000,
  });
  return res.data;
}

export async function crawlSubcategory(args: {
  categoryId: string;
  subcategoryId: string;
  productCode?: string;
  maxPages?: number;
}): Promise<SourceArticle[]> {
  const articles: SourceArticle[] = [];
  const now = new Date().toISOString();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (args.maxPages && page > args.maxPages) break;

    const resp = await fetchListPage({
      category: args.categoryId,
      subCategory: args.subcategoryId,
      productCode: args.productCode,
      page,
    });
    const list = resp?.data?.listData ?? [];
    const totalCount = resp?.data?.listPage?.totalCount ?? 0;
    totalPages = Math.max(1, Math.ceil(totalCount / 10));

    for (const item of list) {
      const seqId = extractSeqId(item.url);
      if (!seqId) continue;
      const absoluteUrl = item.url.startsWith('http') ? item.url : `${LGE_BASE}${item.url}`;
      articles.push({
        seqId,
        title: item.title,
        url: absoluteUrl,
        categoryId: args.categoryId,
        subcategoryId: args.subcategoryId,
        productCode: args.productCode ?? '',
        cateName: item.cateName,
        topic: item.topic,
        sympSubName: item.sympSubName,
        bodySummary: item.content,
        bodyText: null,
        publishedAt: item.date || null,
        modifiedAt: null,
        view: item.view || null,
        hasVideo: !!item.video,
        firstSeenAt: now,
        lastCheckedAt: now,
      });
    }

    page++;
    if (page <= totalPages) await sleep(REQUEST_DELAY_MS);
  }

  return articles;
}

export async function crawlAllCategories(categories: Category[]): Promise<SourceArticle[]> {
  const out: SourceArticle[] = [];
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      const items = await crawlSubcategory({
        categoryId: cat.id,
        subcategoryId: sub.id,
        productCode: sub.productCode,
      });
      out.push(...items);
      await sleep(REQUEST_DELAY_MS);
    }
  }
  return out;
}

export async function fetchArticleDetail(seqId: string): Promise<{
  bodyText: string;
  modifiedAt: string | null;
} | null> {
  try {
    const res = await axios.get(`${LGE_BASE}/support/solutions-${seqId}`, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const bodyText = $('section').text().replace(/\s+/g, ' ').trim();
    const dateMatch = res.data.match(/20\d{2}[.\-]\d{1,2}[.\-]\d{1,2}/);
    const modifiedAt = dateMatch ? dateMatch[0].replace(/\./g, '-') : null;
    return { bodyText, modifiedAt };
  } catch {
    return null;
  }
}
