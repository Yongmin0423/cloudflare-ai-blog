import { apiError, guard, json } from "@/lib/local-admin";
import {
  beginChatGptSignIn,
  chatGptStatus,
  isLocalChatGptRequest,
} from "@/lib/chatgpt";

export async function GET(request: Request) {
  if (!isLocalChatGptRequest(request))
    return new Response(null, { status: 404 });
  try {
    const { userId, secret } = await guard(request);
    return json(await chatGptStatus({ userId, secret }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isLocalChatGptRequest(request))
    return new Response(null, { status: 404 });
  try {
    const { userId, secret } = await guard(request);
    return json({
      url: await beginChatGptSignIn(
        { userId, secret },
        new URL(request.url).origin,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
