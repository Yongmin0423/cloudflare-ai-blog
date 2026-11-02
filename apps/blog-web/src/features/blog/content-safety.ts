export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020\\]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function safeImage(value: unknown): string | null {
  const safe = safeHref(value);
  // Accept the editor HTTP(S) image URLs; restrict relative URLs to checked-in assets.
  if (safe?.startsWith("http://") || safe?.startsWith("https://")) return safe;
  return safe?.startsWith("/images/") && !safe.includes("..") && !safe.includes("%") && /^\/images\/[\w/-]+\.(svg|png|webp|jpe?g)$/.test(safe) ? safe : null;
}
