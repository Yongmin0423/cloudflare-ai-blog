"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function LogoutButton(){
  const router=useRouter();const[pending,setPending]=useState(false);const[error,setError]=useState("");
  async function logout(){if(pending)return;setPending(true);setError("");try{
    // 화면 이동만으로는 DB 세션이 폐기되지 않으므로 먼저 서버 로그아웃을 요청한다.
    const response=await fetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    if(!response.ok)throw new Error();router.replace("/login");router.refresh();
  }catch{setError("로그아웃하지 못했어요. 다시 시도해 주세요.");}finally{setPending(false);}}
  return <span><Button size="sm" variant="outline" onClick={logout} disabled={pending}>{pending?"로그아웃 중…":"로그아웃"}</Button>{error&&<span role="alert">{error}</span>}</span>;
}
