import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  aiDraftRequestSchema,
  aiDraftResponseSchema,
} from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, guard, json } from "@/lib/local-admin";

export async function POST(request: Request) {
  try {
    const { blogId } = await guard(request);
    const input = await body(request, aiDraftRequestSchema, 16_000);
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, blogId }),
    };

    const isDevelopment = process.env.NODE_ENV === "development";
    let response: Response;
    try {
      if (isDevelopment) {
        response = await fetch("http://127.0.0.1:8789/drafts", init);
      } else {
        const { env } = await getCloudflareContext({ async: true });
        response = await env.AGENT_SERVICE.fetch(
          "https://agent-service/drafts",
          init,
        );
      }
    } catch {
      throw new ManagementError(
        503,
        isDevelopment
          ? "AI 글쓰기 Worker에 연결하지 못했어요. 프로젝트 루트의 별도 터미널에서 pnpm dev:agent를 실행해 주세요."
          : "AI 글쓰기 서비스에 연결하지 못했어요. 서비스 실행 상태를 확인해 주세요.",
      );
    }

    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof result === "object" &&
        result &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "AI 초안을 생성하지 못했어요.";
      return json({ error: message }, response.status);
    }
    const draft = aiDraftResponseSchema.safeParse(result);
    if (!draft.success)
      throw new ManagementError(
        502,
        "AI 글쓰기 서비스의 응답을 읽지 못했어요.",
      );
    return json(draft.data);
  } catch (error) {
    return apiError(error);
  }
}
