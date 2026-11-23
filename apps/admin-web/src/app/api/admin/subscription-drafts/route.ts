import { z } from "zod";
import {
  aiDraftRequestSchema,
  subscriptionProviderSchema,
} from "@cloudflare-ai-blog/shared";
import { getSettings, ManagementError } from "@cloudflare-ai-blog/database";
import { apiError, body, guard, json } from "@/lib/local-admin";
import { createHash, randomBytes } from "node:crypto";

const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("pair") }),
  z.strictObject({ action: z.literal("retry"), id: z.uuid() }),
  z.strictObject({
    action: z.literal("enqueue"),
    provider: subscriptionProviderSchema,
    model: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/)
      .optional(),
    input: aiDraftRequestSchema
      .omit({ bodyModel: true, chatGptModel: true })
      .required({ subject: true }),
  }),
]);

export async function GET(request: Request) {
  try {
    const { db, blogId } = await guard(request);
    const { results } = await db
      .prepare(
        "SELECT id,provider,json_extract(input_json,'$.keyword') AS keyword,state,error FROM subscription_drafts WHERE blog_id=? AND json_extract(input_json,'$.kind') IS NULL ORDER BY updated_at DESC LIMIT 20",
      )
      .bind(blogId)
      .all();
    return json({ jobs: results });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, blogId } = await guard(request);
    const data = await body(request, requestSchema);
    if (data.action === "pair") {
      const key = randomBytes(32).toString("base64url");
      await db
        .prepare("UPDATE blogs SET draft_runner_key_hash=? WHERE id=?")
        .bind(createHash("sha256").update(key).digest("hex"), blogId)
        .run();
      return json({ key });
    }
    if (data.action === "retry") {
      const result = await db
        .prepare(
          "UPDATE subscription_drafts SET state='queued',claim=NULL,error=NULL,updated_at=? WHERE blog_id=? AND id=? AND (state IN ('failed','writing') OR (state='saving' AND updated_at<?))",
        )
        .bind(Date.now(), blogId, data.id, Date.now() - 300000)
        .run();
      if (!result.meta.changes)
        throw new ManagementError(409, "다시 요청할 작업이 없어요.");
      return json({ ok: true });
    }
    const { settings } = await getSettings(db, blogId);
    const { name, topic, language, tone, rules, audience, avoid } = settings;
    await db
      .prepare(
        "INSERT INTO subscription_drafts(blog_id,id,provider,input_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(blog_id,id) DO NOTHING",
      )
      .bind(
        blogId,
        data.input.requestId,
        data.provider,
        JSON.stringify({
          ...data.input,
          model: data.model,
          writing: { name, topic, language, tone, rules, audience, avoid },
        }),
        Date.now(),
      )
      .run();
    return json({ id: data.input.requestId });
  } catch (error) {
    return apiError(error);
  }
}
