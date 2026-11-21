import { z } from "zod";
import { ManagementError } from "@cloudflare-ai-blog/database";
import { revisionImageSchema } from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, guard } from "@/lib/local-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await params;
    const { jobId, index } = await body(
      request,
      z.strictObject({
        jobId: z.uuid(),
        index: z.number().int().nonnegative().max(349),
      }),
      1024,
    );
    const row = await db
      .prepare(
        `SELECT d.input_json FROM subscription_drafts d JOIN posts p ON p.blog_id=d.blog_id AND p.id=? WHERE d.blog_id=? AND d.id=? AND d.state='saved' AND p.status!='published' AND json_extract(d.input_json,'$.kind')='revision' AND json_extract(d.input_json,'$.postId')=p.id`,
      )
      .bind(id, blogId, jobId)
      .first<{ input_json: string }>();
    const item = revisionImageSchema.safeParse(
      row && JSON.parse(row.input_json).result?.layout[index],
    );
    if (!item.success)
      throw new ManagementError(404, "수정안의 이미지를 찾을 수 없어요.");
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.data),
    };
    if (process.env.NODE_ENV === "development")
      return await fetch("http://127.0.0.1:8789/revision-image", init);
    const { env } = await getCloudflareContext({ async: true });
    return await env.AGENT_SERVICE.fetch(
      "https://agent-service/revision-image",
      init,
    );
  } catch (error) {
    return apiError(error);
  }
}
