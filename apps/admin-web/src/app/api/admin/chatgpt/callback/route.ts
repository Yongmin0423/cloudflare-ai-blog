import { finishChatGptSignIn, isChatGptLoopback } from "@/lib/chatgpt";

export async function GET(request: Request) {
  if (!isChatGptLoopback(request)) return new Response(null, { status: 404 });
  return finishChatGptSignIn(request);
}
