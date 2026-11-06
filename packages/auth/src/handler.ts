import type { D1Database } from "@cloudflare/workers-types";
import type { AuthSettings } from "./config";
import { sameOriginWrite } from "./config";
import { administratorExists } from "./provision";
export function authJson(body:unknown,status:number,headers?:Headers) {
  // 인증 응답은 캐시하지 않는다. JSON을 바꾸므로 원래 본문의 Content-Length도 제거한다.
  const responseHeaders=new Headers(headers);responseHeaders.set("Cache-Control","no-store");responseHeaders.delete("content-length");
  return Response.json(body,{status,headers:responseHeaders});
}
export async function handleAuthRequest(request:Request,context:{auth:{handler:(request:Request)=>Promise<Response>};db:Pick<D1Database,"prepare">;settings:AuthSettings}) {
  const path=new URL(request.url).pathname;
  // 회원가입·이메일 로그인·계정 변경 등 라이브러리의 다른 API는 공개하지 않는다.
  // 이 앱에서 허용한 아이디 로그인/로그아웃만 Better Auth에 전달한다.
  if(request.method!=="POST"||!["/api/auth/sign-in/username","/api/auth/sign-out"].includes(path))return authJson({error:"사용할 수 없는 인증 경로예요."},404);
  if(!sameOriginWrite(request,context.settings.origin))return authJson({error:"허용하지 않은 로그인 요청이에요."},403);
  const reader=request.body?.getReader();if(!reader)return authJson({error:"요청 내용이 없어요."},400);
  // Content-Length 헤더를 믿지 않고 실제 읽은 바이트로 4KB 제한을 적용한다.
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return authJson({error:"요청 내용이 너무 커요."},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body:Record<string,unknown>;
  try {const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error();body=parsed as Record<string,unknown>;}catch{return authJson({error:"올바른 요청이 아니에요."},400);}
  const signingIn=path.endsWith("/sign-in/username");
  if(signingIn&&(typeof body.username!=="string"||body.username.length>64||typeof body.password!=="string"||body.password.length>128||!body.password.length))return authJson({error:"아이디와 비밀번호를 확인해 주세요."},400);
  // 허용한 필드만 전달하며 비밀번호의 앞뒤 공백은 제거하지 않는다.
  // rememberMe=true로 설정된 8시간 수명을 사용한다. Better Auth 1.7.17에서 false는
  // 별도의 24시간 단기 세션 경로를 사용하므로 클라이언트가 이 값을 선택하게 두지 않는다.
  const payload=signingIn?{username:String(body.username).trim().toLowerCase(),password:body.password,rememberMe:true}:{};
  const forwarded=new Request(request.url,{method:"POST",headers:request.headers,body:JSON.stringify(payload)});
  // 비밀번호 해시 검증, 세션 생성/폐기, 서명된 쿠키 생성은 Better Auth가 처리한다.
  const response=await context.auth.handler(forwarded);
  if(!response.ok){return authJson({error:response.status===429?"로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.":"아이디와 비밀번호를 확인해 주세요."},response.status===429?429:401,response.status===429?new Headers({"Retry-After":response.headers.get("X-Retry-After")??"60"}):undefined);}
  if(!signingIn)return authJson({ok:true},200,response.headers);
  const result=await response.json() as {user:{id:string};token:string};
  // 비밀번호가 맞아도 해당 블로그의 관리자가 아니면 새로 만든 세션을 폐기한다.
  if(!await administratorExists(context.db,result.user.id,context.settings.blogId)) {
    await context.db.prepare("DELETE FROM auth_sessions WHERE userId=? AND token=?").bind(result.user.id,result.token).run();
    return authJson({error:"아이디와 비밀번호를 확인해 주세요."},401);
  }
  // Set-Cookie는 유지하고 응답 본문은 {ok:true}로 바꾼다.
  // 세션 토큰을 브라우저 JavaScript가 읽는 JSON에 포함하지 않기 위해서다.
  return authJson({ok:true},200,response.headers);
}
