import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdministrator,getAuthRuntime } from "@/lib/auth";
import { safeReturnPath } from "@cloudflare-ai-blog/auth";
export const metadata: Metadata = { title: "관리자 로그인 | Blog Studio" };
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const {next}=await searchParams;const returnTo=safeReturnPath(next);
  let needsSetup=false;
  try {
    const administrator=await getAdministrator(await headers());
    if(administrator)redirect(returnTo);
    const {db}=await getAuthRuntime();
    needsSetup=!await db.prepare("SELECT 1 FROM auth_administrators LIMIT 1").first();
  }catch(error){
    // Next redirects must propagate instead of becoming a setup error.
    if(error&&typeof error==="object"&&"digest" in error&&typeof error.digest==="string"&&error.digest.startsWith("NEXT_REDIRECT"))throw error;
    needsSetup=true;
  }
  return <LoginForm returnTo={returnTo} needsSetup={needsSetup} />;
}
