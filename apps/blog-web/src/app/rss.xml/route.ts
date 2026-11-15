import { listPublishedPosts } from "@cloudflare-ai-blog/database/public-blog";
import { postPath, RSS_PATH } from "@/features/blog/content";
import { getPublicFeedContext } from "@/lib/public-blog";

const RSS_LIMIT = 20;
const noStore = { "Cache-Control": "no-store" };
const xmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string) {
  // Strip characters that XML 1.0 does not allow, including unpaired surrogates.
  const valid = Array.from(value).filter((char) => {
    const code = char.codePointAt(0)!;
    return (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
    );
  });
  return valid.join("").replace(/[&<>"']/g, (char) => xmlEntities[char]);
}

export async function GET() {
  const site = await getPublicFeedContext();
  if (!site) return new Response(null, { status: 404, headers: noStore });
  if (!site.origin)
    return new Response(null, { status: 503, headers: noStore });

  const { db, blogId, blog, origin } = site;
  const posts = await listPublishedPosts(db, blogId, { limit: RSS_LIMIT });
  const items = posts.map((post) => {
    const link = escapeXml(new URL(postPath(post.slug), origin).href);
    return `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    <description>${escapeXml(post.excerpt)}</description>
  </item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(blog.name)}</title>
  <link>${escapeXml(new URL("/", origin).href)}</link>
  <description>${escapeXml(blog.description || blog.name)}</description>
  <language>${escapeXml(blog.language)}</language>
  <atom:link href="${escapeXml(new URL(RSS_PATH, origin).href)}" rel="self" type="application/rss+xml" />
${items.join("\n")}
</channel>
</rss>`;
  return new Response(xml, {
    headers: {
      ...noStore,
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
