export const PAGE_SIZE = 4;

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
