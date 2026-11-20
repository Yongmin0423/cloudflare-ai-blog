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

async function fetchDraftAgent(path: "/drafts", init?: RequestInit) {
  const isDevelopment = process.env.NODE_ENV === "development";
  try {
    if (isDevelopment) return await fetch(`http://127.0.0.1:8789${path}`, init);
    const { env } = await getCloudflareContext({ async: true });
    return await env.AGENT_SERVICE.fetch(`https://agent-service${path}`, init);
  } catch {
    throw new ManagementError(
      503,
      isDevelopment
        ? "AI 글쓰기 Worker에 연결하지 못했어요. 프로젝트 루트의 별도 터미널에서 pnpm dev:agent를 실행해 주세요."
        : "AI 글쓰기 서비스에 연결하지 못했어요. 서비스 실행 상태를 확인해 주세요.",
    );
  }
}

export async function POST(request: Request) {
  let chatGptTicket: string | undefined;
  try {
    const { blogId, userId, secret } = await guard(request);
    const { chatGptModel, ...input } = await body(
      request,
      aiDraftRequestSchema,
    );
    if (input.bodyModel)
      throw new ManagementError(
        400,
        "구독 작성은 로컬 실행기를 연결해 주세요.",
      );
    const localChatGpt = isLocalChatGptRequest(request);
    if (
      process.env.NODE_ENV === "development" &&
      input.subject &&
      !input.bodyModel &&
      !chatGptModel
    )
      throw new ManagementError(
        400,
        "ChatGPT를 연결하고 본문 작성 모델을 선택해 주세요.",
      );
    if (chatGptModel) {
      if (!localChatGpt || !input.subject || input.bodyModel)
        throw new ManagementError(
          400,
          "로컬 관리자에서 대상을 확인한 뒤 ChatGPT를 선택해 주세요.",
        );
      chatGptTicket = await createChatGptTicket(
        { userId, secret },
        chatGptModel,
      );
    }
    const response = await fetchDraftAgent("/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, blogId, chatGptTicket }),
    });

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
