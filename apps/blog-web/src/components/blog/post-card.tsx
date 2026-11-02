import Image from "next/image";
import Link from "next/link";
import { categories, formatDate, type BlogPost } from "@/features/blog/content";
export function PostCard({ post }: { post: BlogPost }) {
  const category = categories.find((item) => item.id === post.categoryId);
  return <article className="post-card"><Link href={`/posts/${post.slug}`} className="card-image" aria-label={`${post.title} 읽기`}><Image src={post.cover} alt={post.coverAlt} width={1200} height={800} /></Link><div className="card-content"><p className="card-meta"><Link href={`/category/${category?.slug}`}>{category?.name}</Link><span>·</span><time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time></p><h3><Link href={`/posts/${post.slug}`}>{post.title}</Link></h3><p className="card-excerpt">{post.excerpt}</p><Link href={`/posts/${post.slug}`} className="read-link">이야기 읽기 <span aria-hidden="true">↗</span></Link></div></article>;
}
