import "server-only";
import { ManagementError } from "@cloudflare-ai-blog/database";
import { validationMessages } from "@cloudflare-ai-blog/shared";
import { ZodError, type ZodType } from "@cloudflare-ai-blog/shared";
import { localAdminAllowed } from "./local-admin-guard";
export const LOCAL_BLOG_ID = "10000000-0000-4000-8000-000000000001";
export function guard(request: Request) {
  if (!localAdminAllowed(request,process.env.NODE_ENV)) throw new ManagementError(403,"인증 연결 전에는 localhost 개발 환경에서만 관리 기능을 사용할 수 있어요.");
}
export function json(value: unknown, status=200) { return Response.json(value,{status,headers:{"Cache-Control":"no-store"}}); }
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  // Bound parsing even when Content-Length is absent or dishonest.
  const reader=request.body?.getReader(); if (!reader) throw new ManagementError(400,"요청 내용이 없어요.");
  const decoder=new TextDecoder(); let length=0; let text="";
  while (true) { const chunk=await reader.read(); if(chunk.done) break; length+=chunk.value.byteLength; if(length>32_000) { await reader.cancel(); throw new ManagementError(413,"입력 내용이 너무 커요."); } text+=decoder.decode(chunk.value,{stream:true}); }
  text+=decoder.decode();
  let value: unknown; try { value=JSON.parse(text); } catch { throw new ManagementError(400,"올바른 JSON 요청이 아니에요."); }
  return schema.parse(value);
}
export function apiError(error: unknown) {
  if (error instanceof ZodError) return json({error:validationMessages(error).join("\n")},400);
  if (error instanceof ManagementError) return json({error:error.message},error.status);
  console.error("Local management request failed");
  return json({error:"DB 요청을 처리하지 못했어요. 로컬 마이그레이션과 초기 데이터 상태를 확인해 주세요."},500);
}
