import type { Metadata } from "next";
import type {
  PublicBlog,
  PublishedPostDetail,
} from "@cloudflare-ai-blog/database/public-blog";
import { postLastModifiedAt, postPath, RSS_PATH } from "./content";

export function resolveSiteOrigin(
  configuredUrl: string | undefined,
  domain: string | null,
  isLocal: boolean,
) {
  for (const candidate of [
    configuredUrl,
    domain ? `https://${domain}` : undefined,
  ]) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname,
      );
      if (
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        (isLoopback
          ? isLocal && ["http:", "https:"].includes(url.protocol)
          : url.protocol === "https:")
      ) {
        return url.origin;
      }
    } catch {
      // Try the next configured source when the URL is malformed.
    }
  }
  return isLocal ? "http://localhost:3000" : undefined;
}

export function buildPostSeo(
  post: PublishedPostDetail,
  blog: PublicBlog,
  siteOrigin: string | undefined,
  cover: string | null,
) {
  const title = post.seoTitle?.trim() || post.title;
  const description =
    post.seoDescription?.trim() || post.excerpt.trim() || undefined;
  const url = siteOrigin
    ? new URL(postPath(post.slug), siteOrigin).href
    : undefined;
  const image =
    cover && (!cover.startsWith("/") || siteOrigin)
      ? new URL(cover, siteOrigin).href
      : undefined;
  const datePublished = new Date(post.publishedAt).toISOString();
  const dateModified = new Date(postLastModifiedAt(post)).toISOString();

  const metadata: Metadata = {
    title,
    description: description ?? null,
    alternates: siteOrigin
      ? {
          canonical: url,
          types: { "application/rss+xml": new URL(RSS_PATH, siteOrigin).href },
        }
      : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: blog.name,
      publishedTime: datePublished,
      modifiedTime: dateModified,
      section: post.categoryName ?? undefined,
      images: image ? [{ url: image, alt: post.coverAlt }] : undefined,
    },
  };
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    inLanguage: blog.language,
    articleSection: post.categoryName ?? undefined,
    datePublished,
    dateModified,
    url,
    mainEntityOfPage: url ? { "@type": "WebPage", "@id": url } : undefined,
    image: image ? [image] : undefined,
    publisher: { "@type": "Organization", name: blog.name, url: siteOrigin },
  };
  return { metadata, structuredData };
}

export function serializeStructuredData(value: object) {
  // Prevent a stored title or description from closing the script element.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
