import { apiError, body, json } from "@/lib/local-admin";
import {
  chatGptBodySchema,
  consumeChatGptTicket,
  isChatGptLoopback,
  writeWithChatGpt,
} from "@/lib/chatgpt";

export async function POST(request: Request) {
  if (!isChatGptLoopback(request)) return new Response(null, { status: 404 });
  if (
    request.headers.has("origin") ||
    request.headers.get("content-type") !== "application/json"
  )
    return new Response(null, { status: 403 });
  try {
    const ticket = consumeChatGptTicket(request);
    const input = await body(request, chatGptBodySchema, 200_000);
    return json({ text: await writeWithChatGpt(ticket, input) });
  } catch (error) {
    return apiError(error);
  }
}
