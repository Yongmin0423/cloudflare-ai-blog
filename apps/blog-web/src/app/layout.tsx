import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "기록의 숲 — 작은 일상의 이야기", template: "%s | 기록의 숲" },
  description: "일상에서 발견한 작은 생각과 생활의 이야기를 기록합니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
