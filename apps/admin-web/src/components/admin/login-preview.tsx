"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LoginPreview() {
  const [state, setState] = useState("ready");
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><Link className="brand" href="/"><span className="brand-symbol" aria-hidden="true">b.</span><span>Blog Studio<small>나의 블로그 관리 공간</small></span></Link><div><p className="eyebrow">ADMIN ACCESS</p><h1 id="login-title">관리자 로그인</h1><p className="login-intro">블로그를 관리하는 나만의 공간에 접속하세요.</p></div>
    <div className="demo-notice"><p><strong>인증 연결 전 UI</strong><br />로그인 방식은 아직 정해지지 않았습니다. 이 화면에서는 인증 정보 입력이나 실제 로그인을 수행하지 않아요.</p></div>
    <label className="login-state-control">화면 상태 미리보기<select value={state} onChange={(event) => setState(event.target.value)}><option value="ready">접속 준비</option><option value="pending">인증 확인 중</option><option value="error">인증 실패</option></select></label>
    {state === "error" && <div className="editor-errors" role="alert">인증에 실패한 상황의 예시입니다. 실제 인증 연결 후 다시 시도할 수 있어요.</div>}
    <Button disabled aria-busy={state === "pending"}>{state === "pending" ? "관리자 인증 확인 중… (예시)" : "관리자 인증으로 계속 (연결 전)"}</Button>
    <p className="field-help">관리자 1명만 이용하는 서비스입니다. 실제 접근 보호는 인증 구현 단계에서 적용합니다.</p><Link className="secondary-link" href="/">인증 없는 UI 미리보기로 돌아가기 →</Link>
    </section><p className="login-footer">Blog Studio · 콘텐츠를 위한 작은 작업실</p></main>;
}
