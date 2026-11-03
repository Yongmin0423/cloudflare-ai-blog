-- Business schema v1. D1 enables foreign keys; do not disable them here.
-- IDs are application-generated UUID strings. Times are UTC Unix milliseconds.
CREATE TABLE blogs (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 300),
  language TEXT NOT NULL DEFAULT 'ko' CHECK(language IN ('ko','en','ja')),
  domain TEXT COLLATE NOCASE UNIQUE CHECK(domain IS NULL OR (length(domain) BETWEEN 1 AND 253 AND domain = lower(trim(domain)) AND instr(domain, '/') = 0 AND instr(domain, ':') = 0)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(created_at > 0),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(updated_at >= created_at)
) STRICT;

CREATE TABLE blog_writing_settings (
  blog_id TEXT PRIMARY KEY NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  topic TEXT NOT NULL DEFAULT '' CHECK(length(topic) <= 300),
  audience TEXT NOT NULL DEFAULT '' CHECK(length(audience) <= 300),
  tone TEXT NOT NULL DEFAULT '' CHECK(length(tone) <= 300),
  rules TEXT NOT NULL DEFAULT '' CHECK(length(rules) <= 3000),
  avoid_expressions TEXT NOT NULL DEFAULT '' CHECK(length(avoid_expressions) <= 3000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(updated_at > 0)
) STRICT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE RESTRICT,
  name TEXT COLLATE NOCASE NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40 AND name = trim(name) AND name <> '미분류'),
  slug TEXT COLLATE NOCASE NOT NULL CHECK(length(slug) BETWEEN 1 AND 100 AND slug = trim(slug)),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 300),
  sort_order INTEGER NOT NULL DEFAULT 1 CHECK(sort_order BETWEEN 1 AND 999),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(created_at > 0),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(updated_at >= created_at),
  UNIQUE(blog_id, id),
  UNIQUE(blog_id, name),
  UNIQUE(blog_id, slug)
) STRICT;
CREATE INDEX categories_blog_order ON categories(blog_id, sort_order, name);

CREATE TABLE posts (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE RESTRICT,
  category_id TEXT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  slug TEXT COLLATE NOCASE NOT NULL CHECK(length(slug) BETWEEN 1 AND 120 AND slug = trim(slug)),
  content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'
    CHECK(CASE WHEN json_valid(content_json) THEN json_type(content_json, '$') = 'object'
      AND coalesce(json_extract(content_json, '$.type') = 'doc', 0)
      AND coalesce(json_type(content_json, '$.content') = 'array', 0) ELSE 0 END),
  excerpt TEXT NOT NULL DEFAULT '' CHECK(length(excerpt) <= 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','private')),
  origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','ai')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(created_at > 0),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(updated_at >= created_at),
  content_updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(content_updated_at >= created_at),
  published_at INTEGER CHECK(published_at IS NULL OR published_at >= created_at),
  UNIQUE(blog_id, id),
  UNIQUE(blog_id, slug),
  FOREIGN KEY(blog_id, category_id) REFERENCES categories(blog_id, id) ON DELETE RESTRICT,
  CHECK(status <> 'published' OR published_at IS NOT NULL)
) STRICT;
CREATE INDEX posts_blog_updated ON posts(blog_id, updated_at DESC, id DESC);
CREATE INDEX posts_blog_public ON posts(blog_id, status, published_at DESC, id DESC);
CREATE INDEX posts_blog_category_public ON posts(blog_id, category_id, status, published_at DESC, id DESC);

CREATE TABLE post_seo (
  post_id TEXT PRIMARY KEY NOT NULL,
  blog_id TEXT NOT NULL,
  meta_title TEXT CHECK(meta_title IS NULL OR length(trim(meta_title)) BETWEEN 1 AND 100),
  title_source TEXT NOT NULL DEFAULT 'auto' CHECK(title_source IN ('auto','ai','manual')),
  description TEXT CHECK(description IS NULL OR length(trim(description)) BETWEEN 1 AND 300),
  description_source TEXT NOT NULL DEFAULT 'auto' CHECK(description_source IN ('auto','ai','manual')),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(updated_at > 0),
  FOREIGN KEY(blog_id, post_id) REFERENCES posts(blog_id, id) ON DELETE CASCADE,
  CHECK(meta_title IS NOT NULL OR title_source = 'auto'),
  CHECK(description IS NOT NULL OR description_source = 'auto')
) STRICT;
CREATE INDEX post_seo_blog ON post_seo(blog_id, post_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE RESTRICT,
  r2_key TEXT NOT NULL UNIQUE CHECK(length(trim(r2_key)) > 0),
  original_name TEXT NOT NULL CHECK(length(trim(original_name)) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/gif','image/avif')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  width INTEGER CHECK(width IS NULL OR width > 0),
  height INTEGER CHECK(height IS NULL OR height > 0),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000) CHECK(created_at > 0),
  UNIQUE(blog_id, id)
) STRICT;

CREATE TABLE post_media (
  post_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  blog_id TEXT NOT NULL,
  usage TEXT NOT NULL CHECK(usage IN ('cover','inline')),
  alt TEXT NOT NULL CHECK(length(trim(alt)) BETWEEN 1 AND 500),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  PRIMARY KEY(post_id, usage, position),
  FOREIGN KEY(blog_id, post_id) REFERENCES posts(blog_id, id) ON DELETE CASCADE,
  FOREIGN KEY(blog_id, media_id) REFERENCES media(blog_id, id) ON DELETE RESTRICT,
  CHECK(usage <> 'cover' OR position = 0)
) STRICT;
CREATE UNIQUE INDEX post_media_one_cover ON post_media(post_id) WHERE usage = 'cover';
CREATE INDEX post_media_media ON post_media(blog_id, media_id);
