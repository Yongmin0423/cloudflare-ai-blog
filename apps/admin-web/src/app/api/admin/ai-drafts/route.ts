import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  aiDraftRequestSchema,
  aiDraftResponseSchema,
} from "@cloudflare-ai-blog/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, body, guard, json } from "@/lib/local-admin";

import {
  createChatGptTicket,
  isLocalChatGptRequest,
  releaseChatGptTicket,
} from "@/lib/chatgpt";

export async function POST(request: Request) {
  let chatGptTicket: string | undefined;
  try {
    const { blogId, userId, secret } = await guard(request);
    const { chatGptModel, ...input } = await body(
      request,
      aiDraftRequestSchema,
    );
    const localChatGpt = isLocalChatGptRequest(request);
    if (
      process.env.NODE_ENV === "development" &&
      input.subject &&
      !chatGptModel
    )
      throw new ManagementError(
        400,
        "ChatGPT를 연결하고 본문 작성 모델을 선택해 주세요.",
      );
    if (chatGptModel) {
      if (!localChatGpt || !input.subject)
        throw new ManagementError(
          400,
          "로컬 관리자에서 대상을 확인한 뒤 ChatGPT를 선택해 주세요.",
        );
      chatGptTicket = await createChatGptTicket(
        { userId, secret },
        chatGptModel,
      );
    }
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, blogId, chatGptTicket }),
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
    const output = aiDraftResponseSchema.safeParse(result);
    if (!output.success)
      throw new ManagementError(
        502,
        "AI 글쓰기 서비스의 응답을 읽지 못했어요.",
      );
    return json(output.data);
  } catch (error) {
    return apiError(error);
  } finally {
    if (chatGptTicket) releaseChatGptTicket(chatGptTicket);
  }
}
