-- LGblog Postgres schema (idempotent)

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name_ko TEXT NOT NULL,
  name_en TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL DEFAULT '',
  name_ko TEXT NOT NULL,
  name_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);

CREATE TABLE IF NOT EXISTS source_articles (
  seq_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id TEXT NOT NULL,
  subcategory_id TEXT NOT NULL,
  product_code TEXT NOT NULL DEFAULT '',
  cate_name TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  symp_sub_name TEXT NOT NULL DEFAULT '',
  body_summary TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  published_at DATE,
  modified_at DATE,
  view_text TEXT,
  has_video BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL,
  workflow JSONB
);
CREATE INDEX IF NOT EXISTS idx_source_articles_published ON source_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_articles_subcat ON source_articles(subcategory_id);

CREATE TABLE IF NOT EXISTS blog_posts (
  post_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at DATE,
  category_no TEXT,
  category_name_ko TEXT,
  source_seq_id TEXT,
  assigned_to TEXT,
  added_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_seq ON blog_posts(source_seq_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  delivered JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
