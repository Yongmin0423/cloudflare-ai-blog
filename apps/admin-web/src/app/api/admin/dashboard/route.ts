import { getPostDashboard } from "@cloudflare-ai-blog/database";
import { apiError, guard, json } from "@/lib/local-admin";

export async function GET(request: Request) {
  try {
    const { db, blogId } = await guard(request);
    return json(await getPostDashboard(db, blogId));
  } catch (error) {
    return apiError(error);
  }
}
