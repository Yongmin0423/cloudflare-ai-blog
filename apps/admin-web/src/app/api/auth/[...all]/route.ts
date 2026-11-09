import { getAuthRuntime } from "@/lib/auth";
import { handleAuthRequest,authJson } from "@cloudflare-ai-blog/auth/handler";
export const dynamic="force-dynamic";
// Next.js Route Handler는 연결만 맡는다. 허용 경로와 입력/권한 검사는 공통 핸들러가 담당한다.
async function handle(request:Request) {
  try {return await handleAuthRequest(request,await getAuthRuntime());}
  catch {return authJson({error:"인증을 처리할 수 없어요. 관리자 초기 설정과 DB 연결을 확인해 주세요."},503);}
}
export const GET=handle;
export const POST=handle;
