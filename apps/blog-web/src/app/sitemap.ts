import type { MetadataRoute } from "next";
import { listPublishedSitemapPosts } from "@cloudflare-ai-blog/database/public-blog";
import { postLastModifiedAt, postPath } from "@/features/blog/content";
import { getPublicFeedContext } from "@/lib/public-blog";

// Metadata routes are cached by default. Read the current publication status on each request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getPublicFeedContext();
  if (!site?.origin) return [];
  const { db, blogId, origin } = site;
  const posts = await listPublishedSitemapPosts(db, blogId);
  return posts.map((post) => ({
    url: new URL(postPath(post.slug), origin).href,
    lastModified: new Date(postLastModifiedAt(post)),
  }));
}
