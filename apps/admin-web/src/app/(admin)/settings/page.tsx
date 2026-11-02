import { BlogSettingsManager } from "@/features/management/blog-settings-manager";
export default function SettingsPage() {
  let blogUrl: string | undefined;
  const configured = process.env.BLOG_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  try { const url = new URL(configured); if (["http:", "https:"].includes(url.protocol)) blogUrl = url.href; } catch { /* Display unconfigured state. */ }
  return <BlogSettingsManager blogUrl={blogUrl} />;
}
