import type { D1Database } from "@cloudflare/workers-types";
export function databaseRateLimiter(db:Pick<D1Database,"prepare">) {
  return {async consume(key:string,rule:{window:number;max:number}) {
    // 현재는 IP 헤더를 사용하지 않으므로 인증 경로별 공통 버킷으로 요청을 센다.
    // 이 SHA-256은 요청 제한용 키를 만드는 용도이며 비밀번호 해시와는 별개다.
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key));
    const digest=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
    const now=Date.now();const reset=now+rule.window*1000;
    // SELECT한 뒤 따로 UPDATE하면 병렬 요청이 같은 횟수를 보고 통과할 수 있다.
    // UPSERT 한 번으로 횟수 증가·윈도 초기화·최종 횟수 반환을 원자적으로 처리한다.
    const row=await db.prepare(`INSERT INTO auth_rate_limits(key,count,reset_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE min(count+1,?) END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count,reset_at`)
      .bind(digest,reset,now,rule.max+1,now).first<{count:number;reset_at:number}>();
    if(!row)throw new Error("로그인 시도 제한을 확인하지 못했어요.");
    // Better Auth가 이 결과로 429 응답과 재시도 대기 시간을 결정한다.
    return {allowed:row.count<=rule.max,retryAfter:row.count<=rule.max?null:Math.max(1,Math.ceil((row.reset_at-now)/1000))};
  }};
}
