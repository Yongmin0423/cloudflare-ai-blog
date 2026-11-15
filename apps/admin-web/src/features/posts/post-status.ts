import type { PostDetail } from "@cloudflare-ai-blog/shared";

export const statusLabels: Record<PostDetail["status"], string> = {
  draft: "초안",
  published: "발행",
  private: "비공개",
};
