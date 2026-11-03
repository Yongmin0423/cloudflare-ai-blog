"use client";
import { useEffect, useState } from "react";
import type { ZodType } from "@cloudflare-ai-blog/shared";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(url: string, schema: ZodType<T>, method="GET", payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response=await fetch(url,{ method, cache:"no-store", credentials:"same-origin", headers:payload===undefined?undefined:{"Content-Type":"application/json"}, body:payload===undefined?undefined:JSON.stringify(payload),signal });
  let value: unknown; try { value=await response.json(); } catch { throw new Error("서버 응답을 읽을 수 없어요."); }
  if (!response.ok) throw new ApiError(response.status, typeof value === "object" && value && "error" in value && typeof value.error === "string" ? value.error : "요청을 처리하지 못했어요.");
  const parsed=schema.safeParse(value); if (!parsed.success) throw new Error("서버 데이터 형식을 확인해 주세요."); return parsed.data;
}
export function useApiResource<T>(url: string, schema: ZodType<T>) {
  const [data,setData]=useState<T|null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true); const [version,setVersion]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    request(url,schema,"GET",undefined,controller.signal).then((result)=>{if(!controller.signal.aborted){setData(result);setError("");setLoading(false);}}).catch((error:unknown)=>{if(!controller.signal.aborted){setError(error instanceof Error?error.message:"불러오지 못했어요.");setLoading(false);}});
    return ()=>controller.abort();
  },[url,schema,version]);
  function reload(){setLoading(true);setError("");setVersion((value)=>value+1);}
  async function mutate(method: string, endpoint: string, payload: unknown){const result=await request(endpoint,schema,method,payload);setData(result);setError("");return result;}
  return {data,error,loading,ready:!loading, reload,mutate};
}
