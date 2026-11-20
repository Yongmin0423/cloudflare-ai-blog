import {
  getAiDraftDashboard,
  getPostDashboard,
} from "@cloudflare-ai-blog/database";
import { apiError, guard, json } from "@/lib/local-admin";

export async function GET(request: Request) {
  try {
    const { db, blogId } = await guard(request);
    const [posts, aiJobs] = await Promise.all([
      getPostDashboard(db, blogId),
      getAiDraftDashboard(db, blogId),
    ]);
    return json({ ...posts, aiJobs });
  } catch (error) {
    return apiError(error);
  }
}
