import { PostEditor } from "@/features/posts/post-editor";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const blogUrl =
    process.env.BLOG_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  return <PostEditor key={postId} postId={postId} blogUrl={blogUrl} />;
}
