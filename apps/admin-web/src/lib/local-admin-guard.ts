// This guard is deliberately independent of Cloudflare bindings and client data.
// Replace with real server authentication before enabling production management.
export function localAdminAllowed(request: Request, mode: string | undefined): boolean {
  if (mode !== "development") return false;
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== url.origin) return false;
    if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  }
  return true;
}
