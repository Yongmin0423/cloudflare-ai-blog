import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  postSeoRequestSchema,
  postSeoResponseSchema,
} from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, guard, json } from "@/lib/local-admin";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { blogId } = await guard(request);
    const { id } = await params;
    const { expectedRevision } = await body(
      request,
      postSeoRequestSchema,
      1024,
    );
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId, postId: id, expectedRevision }),
    };

    let response: Response;
    try {
      if (process.env.NODE_ENV === "development") {
        response = await fetch("http://127.0.0.1:8789/post-seo", init);
      } else {
        const { env } = await getCloudflareContext({ async: true });
        response = await env.AGENT_SERVICE.fetch(
          "https://agent-service/post-seo",
          init,
        );
      }
    } catch {
      throw new ManagementError(
        503,
        "SEO Worker에 연결하지 못했어요. 개발 중이라면 pnpm dev:agent 실행 상태를 확인해 주세요.",
      );
    }

    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        value &&
        typeof value === "object" &&
        "error" in value &&
        typeof value.error === "string"
          ? value.error
          : "SEO 제안을 요청하지 못했어요.";
      return json({ error: message }, response.status);
    }
    const result = postSeoResponseSchema.safeParse(value);
    if (!result.success || result.data.revision !== expectedRevision)
      throw new ManagementError(502, "SEO 제안 응답을 읽지 못했어요.");
    return json(result.data);
  } catch (error) {
    return apiError(error);
  }
}
