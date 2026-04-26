import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema, pgStore } from './db/pg.js';
import type { BlogPost, Category, Settings, SourceArticle } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const USE_PG = !!process.env.DATABASE_URL;

async function readJson<T>(filename: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJson(filename: string, data: unknown): Promise<void> {
  const tmp = path.join(DATA_DIR, `.${filename}.tmp`);
  const final = path.join(DATA_DIR, filename);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, final);
}

const jsonStore = {
  async getCategories(): Promise<Category[]> {
    const j = await readJson<{ categories: Category[] }>('categories.json');
    return j.categories;
  },
  async saveCategories(categories: Category[]): Promise<void> {
    const existing = await readJson<{ _note?: string; categories: Category[] }>('categories.json');
    await writeJson('categories.json', { _note: existing._note, categories });
  },
  async getSourceArticles(): Promise<SourceArticle[]> {
    const j = await readJson<{ articles: SourceArticle[] }>('source_articles.json');
    return j.articles;
  },
  async saveSourceArticles(articles: SourceArticle[]): Promise<void> {
    await writeJson('source_articles.json', { articles });
  },
  async getBlogPosts(): Promise<BlogPost[]> {
    const j = await readJson<{ posts: BlogPost[] }>('blog_posts.json');
    return j.posts;
  },
  async saveBlogPosts(posts: BlogPost[]): Promise<void> {
    await writeJson('blog_posts.json', { posts });
  },
  async getSettings(): Promise<Settings> {
    return readJson<Settings>('settings.json');
  },
  async saveSettings(settings: Settings): Promise<void> {
    await writeJson('settings.json', settings);
  },
};

let initialized = false;
async function ensureInit(): Promise<void> {
  if (initialized || !USE_PG) return;
  await initSchema();
  initialized = true;
}

// Wrap the active store so init runs on first call when in PG mode.
export const store = USE_PG
  ? new Proxy(pgStore, {
      get(target, prop: keyof typeof pgStore) {
        const fn = target[prop] as (...args: unknown[]) => Promise<unknown>;
        return async (...args: unknown[]) => {
          await ensureInit();
          return fn.apply(target, args);
        };
      },
    })
  : jsonStore;

export async function upsertSourceArticles(incoming: SourceArticle[]): Promise<{
  added: number;
  updated: number;
  unchanged: number;
}> {
  const existing = await store.getSourceArticles();
  const bySeq = new Map(existing.map((a) => [a.seqId, a]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const now = new Date().toISOString();

  for (const article of incoming) {
    const prev = bySeq.get(article.seqId);
    if (!prev) {
      bySeq.set(article.seqId, { ...article, firstSeenAt: now, lastCheckedAt: now });
      added++;
    } else {
      const changed =
        prev.title !== article.title ||
        prev.bodySummary !== article.bodySummary ||
        prev.modifiedAt !== article.modifiedAt;
      bySeq.set(article.seqId, {
        ...prev,
        ...article,
        firstSeenAt: prev.firstSeenAt,
        lastCheckedAt: now,
      });
      if (changed) updated++;
      else unchanged++;
    }
  }

  await store.saveSourceArticles([...bySeq.values()]);
  return { added, updated, unchanged };
}

export async function upsertBlogPosts(incoming: BlogPost[]): Promise<{
  added: number;
  updated: number;
}> {
  const existing = await store.getBlogPosts();
  const byId = new Map(existing.map((p) => [p.postId, p]));
  let added = 0;
  let updated = 0;
  for (const post of incoming) {
    if (byId.has(post.postId)) {
      byId.set(post.postId, { ...byId.get(post.postId)!, ...post });
      updated++;
    } else {
      byId.set(post.postId, post);
      added++;
    }
  }
  await store.saveBlogPosts([...byId.values()]);
  return { added, updated };
}
