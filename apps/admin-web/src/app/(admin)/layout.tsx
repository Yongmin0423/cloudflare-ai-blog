import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
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
  return <AdminShell blogUrl={blogUrl}>{children}</AdminShell>;
}
