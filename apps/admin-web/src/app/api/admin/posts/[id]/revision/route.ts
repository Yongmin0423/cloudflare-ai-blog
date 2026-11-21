import { z } from "zod";
import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  subscriptionProviderSchema,
  subscriptionRevisionInputSchema,
  revisionJobSchema,
} from "@cloudflare-ai-blog/shared";
import { apiError, body, guard, json } from "@/lib/local-admin";

type Context = { params: Promise<{ id: string }> };
async function draft(request: Request, context: Context) {
  const { db, blogId } = await guard(request);
  const { id } = await context.params;
  const post = await db
    .prepare("SELECT status FROM posts WHERE id=? AND blog_id=?")
    .bind(id, blogId)
    .first<{ status: string }>();
  if (!post) throw new ManagementError(404, "게시글을 찾을 수 없어요.");
  if (post.status === "published")
    throw new ManagementError(
      409,
      "발행한 글을 비공개로 전환한 뒤 수정해 주세요.",
    );
  return { db, blogId, id };
}
export async function GET(request: Request, context: Context) {
  try {
    const { db, blogId, id } = await draft(request, context);
    const row = await db
      .prepare(
        `SELECT id,provider,state,error,input_json FROM subscription_drafts WHERE blog_id=? AND json_extract(input_json,'$.kind')='revision' AND json_extract(input_json,'$.postId')=? ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(blogId, id)
      .first<{ input_json: string }>();
    if (!row) return json({ job: null });
    const { revision, result } = JSON.parse(row.input_json);
    return json({
      job: revisionJobSchema.parse({
        ...row,
        input: revision,
        result: result ?? null,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
const schema = z.strictObject({
  id: z.uuid(),
  provider: subscriptionProviderSchema,
  revision: subscriptionRevisionInputSchema,
});
export async function POST(request: Request, context: Context) {
  try {
    const { db, blogId, id } = await draft(request, context);
    const data = await body(request, schema, 192000);
    await db
      .prepare(
        "INSERT INTO subscription_drafts(blog_id,id,provider,input_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(blog_id,id) DO NOTHING",
      )
      .bind(
        blogId,
        data.id,
        data.provider,
        JSON.stringify({
          kind: "revision",
          postId: id,
          revision: data.revision,
        }),
        Date.now(),
      )
      .run();
    return json({ id: data.id });
  } catch (error) {
    return apiError(error);
  }
}
