import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type {
  BlogPost,
  Category,
  Settings,
  SourceArticle,
  Subcategory,
} from '../types.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for Postgres mode');
  pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });
  return pool;
}

export async function initSchema(): Promise<void> {
  const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await getPool().query(sql);
}

function rowToCategory(row: any): Category {
  return {
    id: row.id,
    nameKo: row.name_ko,
    nameEn: row.name_en,
    subcategories: [],
  };
}

function rowToSub(row: any): Subcategory {
  return {
    id: row.id,
    productCode: row.product_code ?? '',
    nameKo: row.name_ko,
    nameEn: row.name_en,
  };
}

function rowToArticle(row: any): SourceArticle {
  return {
    seqId: row.seq_id,
    title: row.title,
    url: row.url,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    productCode: row.product_code ?? '',
    cateName: row.cate_name ?? '',
    topic: row.topic ?? '',
    sympSubName: row.symp_sub_name ?? '',
    bodySummary: row.body_summary ?? '',
    bodyText: row.body_text,
    publishedAt: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
    modifiedAt: row.modified_at ? row.modified_at.toISOString().slice(0, 10) : null,
    view: row.view_text,
    hasVideo: !!row.has_video,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastCheckedAt: row.last_checked_at.toISOString(),
    workflow: row.workflow ?? undefined,
  };
}

function rowToBlogPost(row: any): BlogPost {
  return {
    postId: row.post_id,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
    categoryNo: row.category_no,
    categoryNameKo: row.category_name_ko,
    sourceSeqId: row.source_seq_id,
    assignedTo: row.assigned_to,
    addedAt: row.added_at.toISOString(),
    source: row.source,
  };
}

export const pgStore = {
  async getCategories(): Promise<Category[]> {
    const cats = (await getPool().query('SELECT * FROM categories ORDER BY position, id')).rows.map(rowToCategory);
    if (cats.length === 0) return [];
    const subs = (await getPool().query('SELECT * FROM subcategories ORDER BY id')).rows;
    const byCat = new Map<string, Subcategory[]>();
    for (const s of subs) {
      if (!byCat.has(s.category_id)) byCat.set(s.category_id, []);
      byCat.get(s.category_id)!.push(rowToSub(s));
    }
    for (const c of cats) c.subcategories = byCat.get(c.id) ?? [];
    return cats;
  },

  async saveCategories(categories: Category[]): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < categories.length; i++) {
        const c = categories[i];
        await client.query(
          `INSERT INTO categories (id, name_ko, name_en, position) VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET name_ko=EXCLUDED.name_ko, name_en=EXCLUDED.name_en, position=EXCLUDED.position`,
          [c.id, c.nameKo, c.nameEn, i],
        );
      }
      // Delete subs that are no longer present
      const allSubIds = categories.flatMap((c) => c.subcategories.map((s) => s.id));
      if (allSubIds.length > 0) {
        await client.query(
          `DELETE FROM subcategories WHERE id <> ALL($1::text[])`,
          [allSubIds],
        );
      } else {
        await client.query('DELETE FROM subcategories');
      }
      for (const c of categories) {
        for (const s of c.subcategories) {
          await client.query(
            `INSERT INTO subcategories (id, category_id, product_code, name_ko, name_en)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET category_id=EXCLUDED.category_id, product_code=EXCLUDED.product_code, name_ko=EXCLUDED.name_ko, name_en=EXCLUDED.name_en`,
            [s.id, c.id, s.productCode, s.nameKo, s.nameEn],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getSourceArticles(): Promise<SourceArticle[]> {
    const r = await getPool().query('SELECT * FROM source_articles ORDER BY published_at DESC NULLS LAST');
    return r.rows.map(rowToArticle);
  },

  async saveSourceArticles(articles: SourceArticle[]): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // Replace strategy: delete missing, upsert provided
      const ids = articles.map((a) => a.seqId);
      if (ids.length > 0) {
        await client.query(`DELETE FROM source_articles WHERE seq_id <> ALL($1::text[])`, [ids]);
      } else {
        await client.query('DELETE FROM source_articles');
      }
      for (const a of articles) {
        await client.query(
          `INSERT INTO source_articles (
             seq_id, title, url, category_id, subcategory_id, product_code,
             cate_name, topic, symp_sub_name, body_summary, body_text,
             published_at, modified_at, view_text, has_video,
             first_seen_at, last_checked_at, workflow
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
           )
           ON CONFLICT (seq_id) DO UPDATE SET
             title=EXCLUDED.title, url=EXCLUDED.url, category_id=EXCLUDED.category_id,
             subcategory_id=EXCLUDED.subcategory_id, product_code=EXCLUDED.product_code,
             cate_name=EXCLUDED.cate_name, topic=EXCLUDED.topic, symp_sub_name=EXCLUDED.symp_sub_name,
             body_summary=EXCLUDED.body_summary, body_text=EXCLUDED.body_text,
             published_at=EXCLUDED.published_at, modified_at=EXCLUDED.modified_at,
             view_text=EXCLUDED.view_text, has_video=EXCLUDED.has_video,
             last_checked_at=EXCLUDED.last_checked_at, workflow=EXCLUDED.workflow`,
          [
            a.seqId, a.title, a.url, a.categoryId, a.subcategoryId, a.productCode,
            a.cateName, a.topic, a.sympSubName, a.bodySummary, a.bodyText,
            a.publishedAt, a.modifiedAt, a.view, a.hasVideo,
            a.firstSeenAt, a.lastCheckedAt, a.workflow ?? null,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getBlogPosts(): Promise<BlogPost[]> {
    const r = await getPool().query('SELECT * FROM blog_posts ORDER BY published_at DESC NULLS LAST');
    return r.rows.map(rowToBlogPost);
  },

  async saveBlogPosts(posts: BlogPost[]): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const ids = posts.map((p) => p.postId);
      if (ids.length > 0) {
        await client.query(`DELETE FROM blog_posts WHERE post_id <> ALL($1::text[])`, [ids]);
      } else {
        await client.query('DELETE FROM blog_posts');
      }
      for (const p of posts) {
        await client.query(
          `INSERT INTO blog_posts (
             post_id, title, url, published_at, category_no, category_name_ko,
             source_seq_id, assigned_to, added_at, source
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (post_id) DO UPDATE SET
             title=EXCLUDED.title, url=EXCLUDED.url, published_at=EXCLUDED.published_at,
             category_no=EXCLUDED.category_no, category_name_ko=EXCLUDED.category_name_ko,
             source_seq_id=EXCLUDED.source_seq_id, assigned_to=EXCLUDED.assigned_to,
             source=EXCLUDED.source`,
          [
            p.postId, p.title, p.url, p.publishedAt, p.categoryNo, p.categoryNameKo,
            p.sourceSeqId, p.assignedTo, p.addedAt, p.source,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getSettings(): Promise<Settings> {
    const r = await getPool().query(`SELECT value FROM settings WHERE key='settings'`);
    if (r.rows.length === 0) {
      return { lastSourceCrawlAt: null, lastBackfillAt: null };
    }
    return r.rows[0].value as Settings;
  },

  async saveSettings(settings: Settings): Promise<void> {
    await getPool().query(
      `INSERT INTO settings (key, value) VALUES ('settings', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [settings],
    );
  },
};
