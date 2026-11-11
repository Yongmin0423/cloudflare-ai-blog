import { PostList } from "@/features/posts/post-list";
import { postListQuerySchema } from "@cloudflare-ai-blog/shared";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const parsed = postListQuerySchema.shape.status.safeParse(
    (await searchParams).status,
  );
  const status = parsed.success ? parsed.data : "all";
  return <PostList key={status} initialStatus={status} />;
}
