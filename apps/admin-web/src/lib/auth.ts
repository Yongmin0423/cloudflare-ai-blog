import "server-only";
import { betterAuth } from "better-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authOptions,readAuthSettings } from "@cloudflare-ai-blog/auth";
import { databaseRateLimiter } from "@cloudflare-ai-blog/auth/rate-limit";
import { administratorExists } from "@cloudflare-ai-blog/auth/provision";

// Next.js 서버와 공통 인증 설정의 연결 지점이다. server-only로 브라우저에서의 import를 막는다.
// D1 같은 요청별 바인딩을 모듈 전역에 보관하지 않고 현재 실행 환경에서 가져온다.
export async function getAuthRuntime() {
  const {env}=await getCloudflareContext({async:true});
  // Workers 바인딩을 기본으로 하되 Next 개발 서버의 환경변수도 사용할 수 있게 한다.
  const config={...env,...Object.fromEntries(["AUTH_SECRET","ADMIN_ORIGIN","ADMIN_BLOG_ID"].filter(key=>!!process.env[key]).map(key=>[key,process.env[key]]))};
  const settings=readAuthSettings(config);
  const db=env.DB;
  if(!db)throw new Error("D1 연결이 필요해요.");
  // betterAuth()가 설정을 실제 인증 서비스 객체로 만든다.
  // auth.handler는 HTTP 요청 처리용, auth.api는 서버 내부에서 호출할 때 사용한다.
  const auth=betterAuth(authOptions(db,settings,databaseRateLimiter(db)));
  const context=await auth.$context;
  // 비동기 초기화와 DB 스키마 검사를 기다려 요청 처리 전에 연결 문제를 확인한다.
  await context.explicitSchemaCheck?.();
  return {auth,db,settings};
}
export async function getAdministrator(headers:Headers) {
  const runtime=await getAuthRuntime();
  // 브라우저가 보낸 쿠키를 Better Auth가 검증하고 DB에서 유효한 세션을 조회한다.
  const session=await runtime.auth.api.getSession({headers});
  // 로그인 성공(인증)과 이 블로그를 관리할 자격(인가)은 각각 확인한다.
  if(!session||!await administratorExists(runtime.db,session.user.id,runtime.settings.blogId))return null;
  return {...runtime,user:session.user,blogId:runtime.settings.blogId};
}
