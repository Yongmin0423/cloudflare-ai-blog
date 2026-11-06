import type { BetterAuthOptions } from "better-auth";
import { username } from "better-auth/plugins/username";
export const DEFAULT_BLOG_ID="10000000-0000-4000-8000-000000000001";
export const usernamePattern=/^[a-z0-9][a-z0-9_.-]{2,31}$/;
export type AuthSettings={origin:string;secret:string;blogId:string};
// 요청의 Host 헤더로 주소를 추측하지 않고 배포 설정을 사용한다.
// 설정이 빠졌다면 인증을 우회하지 않고 초기 설정 오류로 처리한다.
export function readAuthSettings(env:Record<string,unknown>):AuthSettings {
  const secret=env.AUTH_SECRET;const origin=env.ADMIN_ORIGIN;const blogId=env.ADMIN_BLOG_ID;
  if(typeof secret!=="string"||secret.length<32||typeof origin!=="string"||typeof blogId!=="string"||!blogId.trim())throw new Error("관리자 인증 설정이 필요해요. pnpm admin:init을 먼저 실행해 주세요.");
  const parsed=new URL(origin);
  if(parsed.origin!==origin||parsed.username||parsed.password||!(parsed.protocol==="https:"||(parsed.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(parsed.hostname))))throw new Error("ADMIN_ORIGIN은 https 주소 또는 로컬 http 주소여야 해요.");
  return {secret,origin,blogId};
}
type RateStorage=NonNullable<NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]>;
/**
 * Better Auth에 전달할 서버 인증 정책을 만든다. Cloudflare 설정 파일은 아니다.
 * database/secret/origin을 앱에서 주입하므로 다른 관리자 앱에서도 정책을 재사용할 수 있다.
 */
export function authOptions(database:BetterAuthOptions["database"],settings:AuthSettings,storage?:RateStorage) {
  return {
    appName: "Blog Studio",
    database, // 앱에서는 D1 바인딩, 테스트에서는 호환 DB를 전달한다.
    baseURL: settings.origin,
    secret: settings.secret, // 쿠키 등의 서명용 비밀키. 사용자의 비밀번호와는 별개다.
    trustedOrigins: [settings.origin],

    // Better Auth의 기본 테이블 이름을 이 프로젝트의 마이그레이션에 맞춘다.
    user: { modelName: "auth_users" },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 8,
      disableSessionRefresh: true, // 활동할 때마다 만료 시간을 자동 연장하지 않는다.
      cookieCache: { enabled: false }, // 권한 취소·로그아웃을 반영하도록 DB 세션을 확인한다.
    },

    // 이름은 emailAndPassword지만 아래 username 플러그인이 아이디 로그인을 추가한다.
    // 공개 가입은 닫고, 최초 관리자 생성은 별도의 로컬 CLI에서만 수행한다.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    plugins: [username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      usernameValidator: (value) => usernamePattern.test(value),
      usernameNormalization: (value) => value.trim().toLowerCase(),
    })],

    advanced: {
      cookiePrefix: "blog-admin",
      useSecureCookies: settings.origin.startsWith("https:"),
      // 임의로 보낸 IP 헤더로 제한을 우회하지 못하도록 초기에는 공통 버킷을 쓴다.
      ipAddress: { ipAddressHeaders: [] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const, path: "/" },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 120,
      // 성공·실패를 포함한 로그인 요청 전체가 분당 5회 제한을 공유한다.
      customRules: { "/sign-in/username": { window: 60, max: 5 } },
      ...(storage ? { customStorage: storage } : {}),
    },
    telemetry: { enabled: false },
    // satisfies는 TypeScript 설정 검사용이며 요청 데이터의 런타임 검증은 아니다.
  } satisfies BetterAuthOptions;
}
// 쿠키가 자동 전송되는 로그인/변경 API의 CSRF 방어를 위해 Origin도 함께 검사한다.
export function sameOriginWrite(request:Request,origin:string) {
  return new URL(request.url).origin===origin&&request.headers.get("origin")===origin&&request.headers.get("content-type")?.split(";")[0].trim()==="application/json";
}
// 로그인 후 이동할 next 값에는 내부 페이지 경로만 허용해 외부 사이트 이동을 막는다.
export function safeReturnPath(value:string|undefined) {
  if(!value||!value.startsWith("/")||value.startsWith("//")||/[\\\r\n]/.test(value)||value.startsWith("/api/")||value.startsWith("/login"))return "/";
  try {const parsed=new URL(value,"https://admin.invalid");return parsed.origin==="https://admin.invalid"?parsed.pathname+parsed.search:"/";}catch{return "/";}
}
