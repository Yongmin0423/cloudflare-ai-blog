import { notFound } from "next/navigation";
import { PostEditor } from "@/features/posts/post-editor";
import { demoPosts } from "@/features/posts/demo-posts";

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = demoPosts.find((item) => item.id === postId);
  if (!post) notFound();
  return <PostEditor key={post.id} post={post} />;
}
