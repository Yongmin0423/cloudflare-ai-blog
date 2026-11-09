import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection } from "next/server";
import { cache } from "react";
import {
  categoryInputSchema,
  postInputSchema,
  type ZodType,
} from "@cloudflare-ai-blog/shared";
import {
  countPublishedPosts,
  listPublicCategories,
  listPublishedPosts,
  readPublicBlog,
  readPublishedPost,
} from "@cloudflare-ai-blog/database/public-blog";
import { PAGE_SIZE } from "@/features/blog/content";

export async function getPublicBindings() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB || !env.PUBLIC_BLOG_ID?.trim()) {
    throw new Error("The public blog requires DB and PUBLIC_BLOG_ID bindings");
  }
  return { db: env.DB, blogId: env.PUBLIC_BLOG_ID, bucket: env.BLOG_MEDIA };
}

// React cache deduplicates reads in a render. connection() keeps the pages request-time.
const requestBindings = cache(async () => {
  await connection();
  return getPublicBindings();
});

export const getPublicBlog = cache(async () => {
  const { db, blogId } = await requestBindings();
  return readPublicBlog(db, blogId);
});

export const getCategories = cache(async () => {
  const { db, blogId } = await requestBindings();
  return listPublicCategories(db, blogId);
});

function readRouteSlug(routeSlug: string, schema: ZodType<string>) {
  // OpenNext can pass a percent-encoded slug to metadata and a decoded slug to the page.
  try {
    const parsed = schema.safeParse(decodeURIComponent(routeSlug));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getCategory(routeSlug: string) {
  const slug = readRouteSlug(routeSlug, categoryInputSchema.shape.slug);
  if (!slug) return undefined;
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug);
}

export async function getPublishedPage(page: number, categoryId?: string) {
  const { db, blogId } = await requestBindings();
  const total = await countPublishedPosts(db, blogId, categoryId);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) return null;
  const posts = await listPublishedPosts(db, blogId, {
    categoryId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return { posts, total, pages };
}

const findPublishedPost = cache(async (slug: string) => {
  const { db, blogId } = await requestBindings();
  return readPublishedPost(db, blogId, slug);
});

export async function getPublishedPost(routeSlug: string) {
  const slug = readRouteSlug(routeSlug, postInputSchema.shape.slug);
  return slug ? findPublishedPost(slug) : null;
}

export async function getRelatedPosts(categoryId: string, postId: string) {
  const { db, blogId } = await requestBindings();
  return listPublishedPosts(db, blogId, {
    categoryId,
    excludePostId: postId,
    limit: 2,
  });
}
