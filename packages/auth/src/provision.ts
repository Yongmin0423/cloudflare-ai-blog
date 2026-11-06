import type { D1Database } from "@cloudflare/workers-types";
import { hashPassword } from "better-auth/crypto";
import { usernamePattern } from "./config";
export async function administratorExists(db:Pick<D1Database,"prepare">,userId:string,blogId:string) {
  // 사용자 존재만으로 권한을 주지 않고 사용자-블로그 관계를 조회한다.
  return !!await db.prepare("SELECT 1 AS allowed FROM auth_administrators WHERE user_id=? AND blog_id=?").bind(userId,blogId).first();
}
export async function provisionAdministrator(db:Pick<D1Database,"prepare"|"batch">,blogId:string,input:{username:string;password:string}) {
  const username=input.username.trim().toLowerCase();
  if(!usernamePattern.test(username))throw new Error("아이디는 3~32자 영문 소문자·숫자·밑줄·점·하이픈으로 입력해 주세요.");
  if(input.password.length<12||input.password.length>128)throw new Error("비밀번호는 12~128자로 입력해 주세요.");
  // 로그인 때 Better Auth가 검증할 수 있도록 같은 라이브러리의 비밀번호 해시 함수를 쓴다.
  // 평문 비밀번호는 아래 INSERT에 전달하지 않는다.
  const id=crypto.randomUUID();const now=new Date().toISOString();const hash=await hashPassword(input.password);
  // D1 batch로 사용자·로그인 수단·권한을 함께 생성한다. 실패하면 일부 행만 남지 않는다.
  // INSERT의 조건으로 최초 관리자만 허용하며, 기존 계정을 덮어쓰지 않는다.
  const result=await db.batch([
    // email은 공통 스키마 호환용 내부 값이다. 실제 이메일 소유 확인을 의미하지 않는다.
    db.prepare(`INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt,username,displayUsername)
      SELECT ?,?,?,1,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM auth_administrators)`)
      .bind(id,username,`${username}@admin.invalid`,now,now,username,username),
    db.prepare(`INSERT INTO auth_accounts(id,accountId,providerId,userId,password,createdAt,updatedAt)
      SELECT ?,?,'credential',?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_users WHERE id=?)`)
      // credential은 Better Auth의 아이디/이메일+비밀번호 로그인 공급자 ID다.
      .bind(crypto.randomUUID(),id,id,hash,now,now,id),
    db.prepare(`INSERT INTO auth_administrators(user_id,blog_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM auth_users WHERE id=?)`).bind(id,blogId,id),
  ]);
  if(result[0].meta.changes!==1)throw new Error("이미 관리자가 있어요. 이 명령은 최초 관리자만 생성합니다.");
  return {id,username};
}
