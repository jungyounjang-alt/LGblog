import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema, pgStore } from '../server/db/pg.ts';
import type { BlogPost, Category, Settings, SourceArticle } from '../server/types.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

console.log('initialising schema…');
await initSchema();

console.log('reading JSON files…');
const cats = await readJson<{ categories: Category[] }>('categories.json', { categories: [] });
const articles = await readJson<{ articles: SourceArticle[] }>(
  'source_articles.json',
  { articles: [] },
);
const blogs = await readJson<{ posts: BlogPost[] }>('blog_posts.json', { posts: [] });
const settings = await readJson<Settings>('settings.json', {
  lastSourceCrawlAt: null,
  lastBackfillAt: null,
});

console.log(
  `categories=${cats.categories.length} subcats=${cats.categories.reduce((s, c) => s + c.subcategories.length, 0)} articles=${articles.articles.length} blog_posts=${blogs.posts.length}`,
);

console.log('writing categories…');
await pgStore.saveCategories(cats.categories);

console.log('writing source articles (this may take a moment)…');
await pgStore.saveSourceArticles(articles.articles);

console.log('writing blog posts…');
await pgStore.saveBlogPosts(blogs.posts);

console.log('writing settings…');
await pgStore.saveSettings(settings);

console.log('done.');
process.exit(0);
