import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/admin/coming-soon";
import { demoPosts } from "@/features/posts/demo-posts";

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = demoPosts.find((item) => item.id === postId);
  if (!post) notFound();
  return <ComingSoon title="게시글 수정" description={`선택한 샘플 글: ${post.title} · 실제 편집과 저장은 다음 단계에서 연결합니다.`} />;
}
