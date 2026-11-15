import { apiError, body, json } from "@/lib/local-admin";
import {
  chatGptResearchSchema,
  consumeChatGptTicket,
  isChatGptLoopback,
  researchWithChatGpt,
} from "@/lib/chatgpt";

export async function POST(request: Request) {
  if (!isChatGptLoopback(request)) return new Response(null, { status: 404 });
  if (
    request.headers.has("origin") ||
    request.headers.get("content-type") !== "application/json"
  )
    return new Response(null, { status: 403 });
  try {
    const input = await body(request, chatGptResearchSchema, 2_000);
    const ticket = consumeChatGptTicket(request, "search");
    return json(await researchWithChatGpt(ticket, input));
  } catch (error) {
    return apiError(error);
  }
}
