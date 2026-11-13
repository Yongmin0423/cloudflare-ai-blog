import {
  getPost,
  getPostQaReview,
  ManagementError,
} from "@cloudflare-ai-blog/database";
import {
  postQaRequestSchema,
  postQaResponseSchema,
} from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, guard, json } from "@/lib/local-admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await params;
    return json({ review: await getPostQaReview(db, blogId, id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await params;
    const { expectedRevision } = await body(request, postQaRequestSchema, 1024);
    const post = await getPost(db, blogId, id);
    if (
      post.origin !== "ai" ||
      post.status === "published" ||
      post.revision !== expectedRevision
    )
      throw new ManagementError(
        409,
        "검토할 AI 초안의 최신 저장본을 확인해 주세요.",
      );

    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId, postId: id, expectedRevision }),
    };
    let response: Response;
    try {
      if (process.env.NODE_ENV === "development")
        response = await fetch("http://127.0.0.1:8789/post-qa", init);
      else {
        const { env } = await getCloudflareContext({ async: true });
        response = await env.AGENT_SERVICE.fetch(
          "https://agent-service/post-qa",
          init,
        );
      }
    } catch {
      throw new ManagementError(
        503,
        "QA Worker에 연결하지 못했어요. 개발 중이라면 pnpm dev:agent 실행 상태를 확인해 주세요.",
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
          : "발행 전 QA 요청을 처리하지 못했어요.";
      return json({ error: message }, response.status);
    }
    const result = postQaResponseSchema.safeParse(value);
    if (!result.success)
      throw new ManagementError(
        502,
        "QA 결과를 읽지 못했어요. 다시 검토해 주세요.",
      );
    return json(result.data);
  } catch (error) {
    return apiError(error);
  }
}
