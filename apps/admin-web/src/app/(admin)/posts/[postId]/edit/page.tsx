import { PostEditor } from "@/features/posts/post-editor";

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <PostEditor key={postId} postId={postId} />;
}
