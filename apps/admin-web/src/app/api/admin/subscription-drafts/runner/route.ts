import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  subscriptionProviderSchema,
  subscriptionArticleSchema,
  subscriptionRevisionResultSchema,
  validRevisionLayout,
  aiDraftResponseSchema,
} from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, json } from "@/lib/local-admin";
import { getAuthRuntime } from "@/lib/auth";

const job = { id: z.uuid(), claim: z.uuid() };
const schema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("next"),
    revisions: z.boolean().optional(),
    provider: subscriptionProviderSchema,
  }),
  z.strictObject({
    action: z.literal("finish"),
    ...job,
    article: subscriptionArticleSchema,
  }),
  z.strictObject({
    action: z.literal("finishRevision"),
    ...job,
    result: subscriptionRevisionResultSchema,
  }),
  z.strictObject({
    action: z.literal("fail"),
    ...job,
    error: z.string().min(1).max(300),
  }),
]);
export async function POST(request: Request) {
  try {
    const key = /^Bearer ([\w-]{43})$/.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    if (!key) throw new ManagementError(401, "실행기 연결 키가 필요해요.");
    const {
      db,
      settings: { blogId },
    } = await getAuthRuntime();
    if (
      !(await db
        .prepare("SELECT 1 FROM blogs WHERE id=? AND draft_runner_key_hash=?")
        .bind(blogId, createHash("sha256").update(key).digest("hex"))
        .first())
    )
      throw new ManagementError(401, "실행기 연결 키를 다시 확인해 주세요.");
    const data = await body(request, schema, 192_000);
    if (data.action === "next") {
      const claim = randomUUID();
      const row = await db
        .prepare(
          `UPDATE subscription_drafts SET state='writing',claim=?,updated_at=? WHERE blog_id=? AND id=(SELECT id FROM subscription_drafts WHERE blog_id=? AND provider=? AND state='queued' AND (?=1 OR json_extract(input_json,'$.kind') IS NULL) ORDER BY updated_at,id LIMIT 1) AND state='queued' RETURNING id,input_json`,
        )
        .bind(
          claim,
          Date.now(),
          blogId,
          blogId,
          data.provider,
          data.revisions ? 1 : 0,
        )
        .first<{ id: string; input_json: string }>();
      return json({
        job: row
          ? { id: row.id, claim, input: JSON.parse(row.input_json) }
          : null,
      });
    }
    const row = await db
      .prepare(
        "SELECT state,input_json,provider FROM subscription_drafts WHERE blog_id=? AND id=? AND claim=?",
      )
      .bind(blogId, data.id, data.claim)
      .first<{ state: string; input_json: string; provider: string }>();
    if (!row)
      throw new ManagementError(409, "작업이 취소되었거나 다시 요청되었어요.");
    if (row.state === "saved") return json({ id: data.id });
    if (row.state !== "writing" && row.state !== "saving")
      throw new ManagementError(409, "진행 중인 작업이 아니에요.");
    if (data.action === "fail") {
      await db
        .prepare(
          "UPDATE subscription_drafts SET state='failed',error=?,updated_at=? WHERE blog_id=? AND id=? AND claim=? AND state='writing'",
        )
        .bind(data.error, Date.now(), blogId, data.id, data.claim)
        .run();
      return json({ ok: true });
    }
    const input = JSON.parse(row.input_json);
    if (data.action === "finishRevision") {
      if (input.kind !== "revision")
        throw new ManagementError(409, "본문 수정 작업이 아니에요.");
      if (!validRevisionLayout(input.revision.blocks.length, data.result))
        throw new ManagementError(400, "수정 대상이 요청과 일치하지 않아요.");
      const updated = await db
        .prepare(
          "UPDATE subscription_drafts SET input_json=json_set(input_json,'$.result',json(?)),state='saved',error=NULL,updated_at=? WHERE blog_id=? AND id=? AND claim=? AND state='writing'",
        )
        .bind(
          JSON.stringify(data.result),
          Date.now(),
          blogId,
          data.id,
          data.claim,
        )
        .run();
      if (!updated.meta.changes)
        throw new ManagementError(409, "작업 상태가 변경됐어요.");
      return json({ id: data.id });
    }
    if (input.kind === "revision")
      throw new ManagementError(400, "본문 수정 결과가 필요해요.");
    if (row.provider !== data.article.provider)
      throw new ManagementError(400, "구독 종류가 다릅니다.");
    delete input.writing;
    delete input.model;
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        blogId,
        subscriptionArticle: data.article,
      }),
    };
    const lock = await db
      .prepare(
        "UPDATE subscription_drafts SET state='saving',updated_at=? WHERE blog_id=? AND id=? AND claim=? AND (state='writing' OR (state='saving' AND updated_at<?))",
      )
      .bind(Date.now(), blogId, data.id, data.claim, Date.now() - 300000)
      .run();
    if (!lock.meta.changes)
      throw new ManagementError(
        409,
        "이미 저장 중이에요. 잠시 후 다시 확인하세요.",
      );
    try {
      const response =
        process.env.NODE_ENV === "development"
          ? await fetch("http://127.0.0.1:8789/drafts", init)
          : await (
              await getCloudflareContext({ async: true })
            ).env.AGENT_SERVICE.fetch("https://agent-service/drafts", init);
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new ManagementError(
          response.status,
          result.error ?? "초안 저장에 실패했어요.",
        );
      const saved = aiDraftResponseSchema.parse(result);
      if (!("id" in saved) || saved.id !== data.id)
        throw new ManagementError(502, "저장 결과를 확인할 수 없어요.");
      await db
        .prepare(
          "UPDATE subscription_drafts SET state='saved',error=NULL,updated_at=? WHERE blog_id=? AND id=?",
        )
        .bind(Date.now(), blogId, data.id)
        .run();
      return json(saved);
    } catch (error) {
      await db
        .prepare(
          "UPDATE subscription_drafts SET state='writing',updated_at=?,error='저장 실패. 맥에서 다시 전송할 수 있어요.' WHERE blog_id=? AND id=? AND claim=? AND state='saving'",
        )
        .bind(Date.now(), blogId, data.id, data.claim)
        .run();
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
