import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdministrator } from "@/lib/auth";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // 관리자 화면을 렌더링하기 전에 서버에서 확인한다. 각 관리 API도 guard()로 따로 보호한다.
  const administrator=await getAdministrator(await headers()).catch(()=>null);
  if(!administrator)redirect("/login");
  const configuredUrl = process.env.BLOG_URL;
  let blogUrl: string | undefined;
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      if (url.protocol === "https:" || url.protocol === "http:") blogUrl = url.href;
    } catch {
      // Do not render a navigation link for an invalid address.
    }
  } else if (process.env.NODE_ENV === "development") {
    blogUrl = "http://localhost:3000";
  }
  return <AdminShell blogUrl={blogUrl} administratorName={administrator.user.name}>{children}</AdminShell>;
}
