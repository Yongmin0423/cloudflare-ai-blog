import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostBody } from "@/components/blog/post-body";
import { PostCard } from "@/components/blog/post-card";
import { blog, categories, publishedPost, publishedPosts, formatDate } from "@/features/blog/content";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = publishedPost((await params).slug); if (!post) notFound();
  return { title: post.title, description: post.excerpt };
}
export default async function PostPage({ params }: Props) {
  const post = publishedPost((await params).slug); if (!post) notFound();
  const category = categories.find((item) => item.id === post.categoryId)!;
  const related = publishedPosts(post.categoryId).filter((item) => item.id !== post.id).slice(0, 2);
  return <div className="blog-container article-page"><div className="page-breadcrumb"><Link href="/">홈</Link><span>/</span><Link href={`/category/${category.slug}`}>{category.name}</Link></div><article><header className="article-heading"><Link className="article-category" href={`/category/${category.slug}`}>{category.name}</Link><h1>{post.title}</h1><p className="article-excerpt">{post.excerpt}</p><p className="article-meta"><span>{blog.author}</span><span>·</span><time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time></p></header><Image className="article-cover" src={post.cover} alt={post.coverAlt} width={1200} height={800} priority /><div className="article-body"><PostBody content={post.content} /><div className="author-note"><span className="author-symbol" aria-hidden="true">✳</span><div><strong>{blog.author}</strong><p>일상에서 발견한 작은 이야기를 천천히 기록합니다.</p></div></div><Link className="back-link" href={`/category/${category.slug}`}>← {category.name} 글 더 보기</Link></div></article>{related.length > 0 && <section className="related-section" aria-labelledby="related-title"><div className="section-heading"><h2 id="related-title">함께 읽으면 좋은 이야기</h2></div><div className="post-grid">{related.map((item) => <PostCard key={item.id} post={item} />)}</div></section>}</div>;
}
