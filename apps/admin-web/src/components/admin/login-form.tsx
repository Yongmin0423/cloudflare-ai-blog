"use client";
import Link from "next/link";
import { useState,useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function LoginForm({returnTo,needsSetup}:{returnTo:string;needsSetup:boolean}) {
  const router=useRouter();const busy=useRef(false);
  const [username,setUsername]=useState("");const [password,setPassword]=useState("");
  const [pending,setPending]=useState(false);const [error,setError]=useState("");
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy.current||needsSetup)return;busy.current=true;setPending(true);setError("");
    try{
      // 화면은 아이디·비밀번호만 보내고, 성공 시 HttpOnly 쿠키는 브라우저가 받는다.
      // JavaScript에서 세션 토큰을 별도로 저장하거나 읽을 필요가 없다.
      const response=await fetch("/api/auth/sign-in/username",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      if(!response.ok){setError(response.status===429?"로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.":response.status===503?"관리자 초기 설정과 DB 연결을 확인해 주세요.":"아이디와 비밀번호를 확인해 주세요.");return;}
      // 새 쿠키를 기준으로 서버 레이아웃이 로그인·권한을 다시 검사하도록 갱신한다.
      setPassword("");router.replace(returnTo);router.refresh();
    }catch{setError("로그인 서버에 연결하지 못했어요. 다시 시도해 주세요.");}
    finally{busy.current=false;setPending(false);}
  }
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <Link className="brand" href="/login"><span className="brand-symbol" aria-hidden="true">b.</span><span>Blog Studio<small>나의 블로그 관리 공간</small></span></Link>
    <div><p className="eyebrow">ADMIN ACCESS</p><h1 id="login-title">관리자 로그인</h1><p className="login-intro">관리자 계정으로 블로그 관리 공간에 접속하세요.</p></div>
    {needsSetup&&<div className="editor-errors" role="alert">관리자 초기 설정이 필요해요. 프로젝트의 관리자 인증 설정 안내를 확인해 주세요.</div>}
    <form className="management-form" onSubmit={submit}>
      <label>아이디<input name="username" autoComplete="username" required maxLength={32} value={username} disabled={pending||needsSetup} onChange={e=>setUsername(e.target.value)} /></label>
      <label>비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={pending||needsSetup} onChange={e=>setPassword(e.target.value)} /></label>
      {error&&<p className="editor-errors" role="alert">{error}</p>}
      <Button type="submit" disabled={pending||needsSetup} aria-busy={pending}>{pending?"로그인 확인 중…":"로그인"}</Button>
    </form>
    <p className="field-help">사전에 등록한 관리자만 로그인할 수 있어요.</p>
    </section><p className="login-footer">Blog Studio · 콘텐츠를 위한 작은 작업실</p></main>;
}
