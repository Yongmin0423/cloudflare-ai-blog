import type { D1Database } from "@cloudflare/workers-types";
import {
  documentSchema,
  type EditorDocument,
} from "@cloudflare-ai-blog/shared";

type Database = Pick<D1Database, "prepare">;

export type PublicBlog = {
  name: string;
  description: string;
  language: "ko" | "en" | "ja";
  domain: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  shareMediaId: string | null;
  shareImageAlt: string | null;
};

export type PublicCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

export type PublishedPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  publishedAt: number;
  coverUrl: string;
  coverMediaId: string | null;
  coverAlt: string;
};

export type PublishedPostDetail = PublishedPost & {
  content: EditorDocument;
  contentUpdatedAt: number;
  seoTitle: string | null;
  seoDescription: string | null;
};

const publishedCondition =
  "p.blog_id=? AND p.status='published' AND p.published_at IS NOT NULL";
const postFields = `p.id,p.slug,p.title,p.excerpt,p.category_id AS categoryId,
  c.name AS categoryName,c.slug AS categorySlug,p.published_at AS publishedAt,
  p.cover_url AS coverUrl,pm.media_id AS coverMediaId,coalesce(pm.alt,p.cover_alt) AS coverAlt`;
const postJoins = `LEFT JOIN categories c ON c.blog_id=p.blog_id AND c.id=p.category_id
  LEFT JOIN post_media pm ON pm.blog_id=p.blog_id AND pm.post_id=p.id AND pm.usage='cover'`;

export function readPublicBlog(db: Database, blogId: string) {
  return db
    .prepare(
      `SELECT b.name,b.description,b.language,b.domain,seo.meta_title AS seoTitle,
      seo.description AS seoDescription,seo.share_media_id AS shareMediaId,seo.share_image_alt AS shareImageAlt
      FROM blogs b LEFT JOIN blog_seo seo ON seo.blog_id=b.id WHERE b.id=?`,
    )
    .bind(blogId)
    .first<PublicBlog>();
}

export async function listPublicCategories(db: Database, blogId: string) {
  const { results } = await db
    .prepare(
      "SELECT id,slug,name,description FROM categories WHERE blog_id=? ORDER BY sort_order,name,id",
    )
    .bind(blogId)
    .all<PublicCategory>();
  return results;
}

export async function countPublishedPosts(
  db: Database,
  blogId: string,
  categoryId?: string,
) {
  const categoryFilter = categoryId ? " AND p.category_id=?" : "";
  const result = await db
    .prepare(
      `SELECT count(*) AS total FROM posts p WHERE ${publishedCondition}${categoryFilter}`,
    )
    .bind(blogId, ...(categoryId ? [categoryId] : []))
    .first<{ total: number }>();
  return result?.total ?? 0;
}

export async function listPublishedPosts(
  db: Database,
  blogId: string,
  {
    categoryId,
    excludePostId,
    limit,
    offset = 0,
  }: {
    categoryId?: string;
    excludePostId?: string;
    limit: number;
    offset?: number;
  },
) {
  const conditions = [publishedCondition];
  const params: (string | number)[] = [blogId];
  if (categoryId) {
    conditions.push("p.category_id=?");
    params.push(categoryId);
  }
  if (excludePostId) {
    conditions.push("p.id<>?");
    params.push(excludePostId);
  }
  const { results } = await db
    .prepare(
      `SELECT ${postFields} FROM posts p ${postJoins}
    WHERE ${conditions.join(" AND ")} ORDER BY p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<PublishedPost>();
  return results;
}

export async function readPublishedPost(
  db: Database,
  blogId: string,
  slug: string,
): Promise<PublishedPostDetail | null> {
  const row = await db
    .prepare(
      `SELECT ${postFields},p.content_json AS contentJson,p.content_updated_at AS contentUpdatedAt,
    s.meta_title AS seoTitle,s.description AS seoDescription
    FROM posts p ${postJoins}
    LEFT JOIN post_seo s ON s.blog_id=p.blog_id AND s.post_id=p.id
    WHERE ${publishedCondition} AND p.slug=?`,
    )
    .bind(blogId, slug)
    .first<Omit<PublishedPostDetail, "content"> & { contentJson: string }>();
  if (!row) return null;
  const { contentJson, ...post } = row;
  return { ...post, content: documentSchema.parse(JSON.parse(contentJson)) };
}

export async function listPublishedSitemapPosts(db: Database, blogId: string) {
  const { results } = await db
    .prepare(
      `SELECT p.slug,p.published_at AS publishedAt,p.content_updated_at AS contentUpdatedAt
    FROM posts p WHERE ${publishedCondition}
    ORDER BY p.published_at DESC,p.id DESC LIMIT 50000`,
    )
    .bind(blogId)
    .all<{ slug: string; publishedAt: number; contentUpdatedAt: number }>();
  return results;
}

export function readPublishedMedia(
  db: Database,
  blogId: string,
  postId: string,
  mediaId: string,
) {
  return db
    .prepare(
      `SELECT m.r2_key AS key,m.mime_type AS mimeType FROM posts p
    JOIN post_media pm ON pm.blog_id=p.blog_id AND pm.post_id=p.id
    JOIN media m ON m.blog_id=pm.blog_id AND m.id=pm.media_id
    WHERE ${publishedCondition} AND p.id=? AND m.id=?`,
    )
    .bind(blogId, postId, mediaId)
    .first<{ key: string; mimeType: string }>();
}

export function readSiteShareImage(
  db: Database,
  blogId: string,
  mediaId: string,
) {
  return db
    .prepare(
      `SELECT m.r2_key AS key,m.mime_type AS mimeType FROM blog_seo seo
      JOIN media m ON m.blog_id=seo.blog_id AND m.id=seo.share_media_id
      WHERE seo.blog_id=? AND m.id=?`,
    )
    .bind(blogId, mediaId)
    .first<{ key: string; mimeType: string }>();
}
