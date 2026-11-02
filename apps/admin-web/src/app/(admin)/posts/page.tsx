import { PostList } from "@/features/posts/post-list";
import { demoPosts } from "@/features/posts/demo-posts";

export default function PostsPage() {
  return <PostList posts={demoPosts} />;
}
