export const PAGE_SIZE = 4;
export const SITEMAP_PATH = "/sitemap.xml";
export const RSS_PATH = "/rss.xml";

export function readPage(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});
export function formatDate(value: number) {
  return dateFormatter.format(value);
}

export const postPath = (slug: string) => `/posts/${encodeURIComponent(slug)}`;
export const categoryPath = (slug: string) =>
  `/category/${encodeURIComponent(slug)}`;

export function postLastModifiedAt(post: {
  publishedAt: number;
  contentUpdatedAt: number;
}) {
  return Math.max(post.publishedAt, post.contentUpdatedAt);
}
