import type { MetadataRoute } from "next";
import { SITEMAP_PATH } from "@/features/blog/content";
import { getPublicFeedContext } from "@/lib/public-blog";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getPublicFeedContext();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: site?.origin ? new URL(SITEMAP_PATH, site.origin).href : undefined,
  };
}
