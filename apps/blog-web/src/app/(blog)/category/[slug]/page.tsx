import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryNav, Pagination } from "@/components/blog/list-navigation";
import { PostCard } from "@/components/blog/post-card";
import { categoryBySlug, publishedPosts, readPage, PAGE_SIZE } from "@/features/blog/content";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = categoryBySlug((await params).slug); if (!category) notFound();
  return { title: category.name, description: category.description };
}
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = categoryBySlug((await params).slug); if (!category) notFound();
  const page = readPage((await searchParams).page); const posts = publishedPosts(category.id); const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  if (!page || page > pages) notFound();
  return <div className="blog-container category-page"><div className="page-breadcrumb"><Link href="/">홈</Link><span>/</span><span>카테고리</span></div><header className="category-heading"><p className="eyebrow">EXPLORE THE JOURNAL</p><h1>{category.name}</h1><p>{category.description}</p></header><section className="stories-section" id="stories" aria-label={`${category.name} 글 목록`}><CategoryNav current={category.id} /><p className="result-count">{posts.length}개의 이야기</p>{posts.length ? <div className="post-grid">{posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((post) => <PostCard key={post.id} post={post} />)}</div> : <div className="empty-state"><h2>아직 이 주제의 글이 없어요.</h2><p>다른 이야기부터 천천히 둘러보세요.</p><Link href="/">전체 글 보기 →</Link></div>}<Pagination page={page} pages={pages} base={`/category/${category.slug}`} /></section></div>;
}
