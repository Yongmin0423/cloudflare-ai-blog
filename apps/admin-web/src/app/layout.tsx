import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloudflare AI Blog Admin",
  description: "블로그 관리자",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
