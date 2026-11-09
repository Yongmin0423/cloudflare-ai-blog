import type { ReactNode } from "react";
import { getPublicBlog } from "@/lib/public-blog";
import "./globals.css";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const blog = await getPublicBlog();
  return (
    <html lang={blog?.language ?? "ko"}>
      <body>{children}</body>
    </html>
  );
}
