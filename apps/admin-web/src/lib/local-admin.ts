import "server-only";
import { ManagementError } from "@cloudflare-ai-blog/database";
import { validationMessages } from "@cloudflare-ai-blog/shared";
import { ZodError, type ZodType } from "@cloudflare-ai-blog/shared";
import { getAdministrator } from "./auth";
import { sameOriginWrite } from "@cloudflare-ai-blog/auth";

// 관리자인지 아닌지 판별하는 함수
export async function guard(
  request: Request,
  writeContentType = "application/json",
) {
  // 화면 검사와 별개로 모든 관리 API의 시작 지점에서 호출한다.
  // DB 오류(503)를 로그인 안 됨(401)과 구분하고, 클라이언트가 보낸 blogId를 신뢰하지 않는다.
  let administrator;
  try {
    administrator = await getAdministrator(request.headers);
  } catch {
    throw new ManagementError(
      503,
      "관리자 인증 설정과 DB 연결을 확인해 주세요.",
    );
  }

  if (!administrator)
    throw new ManagementError(401, "관리자 로그인이 필요해요.");

  if (
    new URL(request.url).origin !== administrator.settings.origin ||
    (request.method !== "GET" &&
      request.method !== "HEAD" &&
      !sameOriginWrite(
        request,
        administrator.settings.origin,
        writeContentType,
      ))
  )
    throw new ManagementError(403, "허용하지 않은 관리 요청이에요.");
  return {
    db: administrator.db,
    blogId: administrator.blogId,
    userId: administrator.user.id,
    secret: administrator.settings.secret,
  };
}

// JSON을 반환하는 함수
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

//
export async function body<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 32_000,
): Promise<T> {
  // Bound parsing even when Content-Length is absent or dishonest.
  const reader = request.body?.getReader();

  if (!reader) throw new ManagementError(400, "요청 내용이 없어요.");
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new ManagementError(413, "입력 내용이 너무 커요.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ManagementError(400, "올바른 JSON 요청이 아니에요.");
  }
  return schema.parse(value);
}
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return json({ error: validationMessages(error).join("\n") }, 400);
  if (error instanceof ManagementError)
    return json({ error: error.message }, error.status);
  console.error("Local management request failed");
  return json(
    {
      error:
        "DB 요청을 처리하지 못했어요. 로컬 마이그레이션과 초기 데이터 상태를 확인해 주세요.",
    },
    500,
  );
}
