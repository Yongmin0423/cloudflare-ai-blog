import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  aiDraftBodyProviderSchema,
  type AiDraftBodyProvider,
} from "@cloudflare-ai-blog/shared";
import { z } from "zod";

function providerKey(env: AgentServiceEnv, provider: AiDraftBodyProvider) {
  return (
    provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY
  )?.trim();
}

export function availableDraftProviders(env: AgentServiceEnv) {
  return aiDraftBodyProviderSchema.options.filter((provider) =>
    providerKey(env, provider),
  );
}

const block = z.object({ type: z.string(), text: z.string().optional() });
const openAiResponse = z.object({
  status: z.string(),
  output: z.array(
    z.object({ type: z.string(), content: z.array(block).optional() }),
  ),
});
const claudeResponse = z.object({
  stop_reason: z.string(),
  content: z.array(block),
});

export async function generateExternalDraftBody(
  env: AgentServiceEnv,
  provider: AiDraftBodyProvider,
  instructions: string,
  input: string,
  schema: object,
  maxOutputTokens: number,
) {
  const openAi = provider === "openai";
  const label = openAi ? "OpenAI GPT" : "Claude";
  const key = providerKey(env, provider);
  if (!key)
    throw new ManagementError(503, `${label} 연결이 설정되지 않았어요.`);

  const format = { type: "json_schema", schema };
  const response = await fetch(
    openAi
      ? "https://api.openai.com/v1/responses"
      : "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(!openAi ? { "anthropic-version": "2026-10-21" } : {}),
      },
      body: JSON.stringify(
        openAi
          ? {
              model: "gpt-5.4-mini",
              instructions,
              input,
              store: false,
              max_output_tokens: maxOutputTokens,
              reasoning: { effort: "low" },
              text: {
                format: { ...format, name: "article_draft", strict: true },
              },
            }
          : {
              model: "claude-sonnet-5-5",
              system: instructions,
              messages: [{ role: "user", content: input }],
              max_tokens: maxOutputTokens,
              output_config: { format, effort: "low" },
            },
      ),
      signal: AbortSignal.timeout(90_000),
      redirect: "error",
    },
  ).catch(() => {
    throw new ManagementError(
      502,
      `${label}에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.`,
    );
  });

  if (!response.ok) {
    console.warn("Draft provider request failed", {
      provider,
      status: response.status,
    });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new ManagementError(
        502,
        `${label} API 키와 모델 접근 권한을 확인해 주세요.`,
      );
    if (response.status === 429)
      throw new ManagementError(
        429,
        `${label}의 사용 한도나 결제 상태를 확인해 주세요.`,
      );
    throw new ManagementError(
      502,
      `${label}에서 본문을 생성하지 못했어요. 다시 시도해 주세요.`,
    );
  }

  const value: unknown = await response.json().catch(() => null);
  let blocks: z.infer<typeof block>[] = [];
  let refused = false;
  if (openAi) {
    const parsed = openAiResponse.safeParse(value);
    if (parsed.success && parsed.data.status === "completed") {
      blocks = parsed.data.output.flatMap((item) =>
        item.type === "message" ? (item.content ?? []) : [],
      );
      refused = blocks.some(({ type }) => type === "refusal");
    }
  } else {
    const parsed = claudeResponse.safeParse(value);
    if (parsed.success) {
      refused = parsed.data.stop_reason === "refusal";
      if (parsed.data.stop_reason === "end_turn") blocks = parsed.data.content;
    }
  }
  if (refused)
    throw new ManagementError(
      422,
      `${label}이 본문 생성 요청을 처리하지 못했어요. 주제나 작성 지시를 확인해 주세요.`,
    );
  return blocks
    .filter(({ type }) => type === (openAi ? "output_text" : "text"))
    .map(({ text }) => text ?? "")
    .join("");
}
