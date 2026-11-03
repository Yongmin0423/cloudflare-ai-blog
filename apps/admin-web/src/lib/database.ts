import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Server-only use: never call this from client components.
export async function getDatabase(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}
