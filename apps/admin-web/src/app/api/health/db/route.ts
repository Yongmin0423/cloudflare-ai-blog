import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const db = await getDatabase();
    const result = await db.prepare("SELECT 1 AS connected").first<{ connected: number }>();
    return Response.json({ ok: result?.connected === 1, storage: "D1" }, { status: result?.connected === 1 ? 200 : 503, headers });
  } catch {
    // Do not include credentials, account IDs or database errors in public output.
    return Response.json({ ok: false, storage: "D1" }, { status: 503, headers });
  }
}
