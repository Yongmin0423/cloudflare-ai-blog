import { z } from "zod";
import { apiError, body, guard, json } from "@/lib/local-admin";
import { isLocalChatGptRequest, testChatGptWebSearch } from "@/lib/chatgpt";

const requestSchema = z.strictObject({
  model: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  if (!isLocalChatGptRequest(request))
    return new Response(null, { status: 404 });
  try {
    const { userId, secret } = await guard(request);
    const { model } = await body(request, requestSchema, 1_000);
    return json(await testChatGptWebSearch({ userId, secret }, model));
  } catch (error) {
    return apiError(error);
  }
}
