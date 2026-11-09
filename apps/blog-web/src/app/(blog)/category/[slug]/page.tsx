import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryNav, Pagination } from "@/components/blog/list-navigation";
import { PostCard } from "@/components/blog/post-card";
import { categoryPath, readPage } from "@/features/blog/content";
import {
  getCategories,
  getCategory,
  getPublishedPage,
} from "@/lib/public-blog";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  if (!category) notFound();
  return {
    title: category.name,
    description: category.description || undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = readPage(pageParam);
  if (!page) notFound();

  const category = await getCategory(slug);
  if (!category) notFound();
  const [categories, result] = await Promise.all([
    getCategories(),
    getPublishedPage(page, category.id),
  ]);
  if (!result) notFound();
  const { posts, pages, total } = result;

  return (
    <div className="blog-container category-page">
      <div className="page-breadcrumb">
        <Link href="/" prefetch={false}>
          홈
        </Link>
        <span>/</span>
        <span>카테고리</span>
      </div>
      <header className="category-heading">
        <p className="eyebrow">EXPLORE THE JOURNAL</p>
        <h1>{category.name}</h1>
        {category.description && <p>{category.description}</p>}
      </header>
      <section
        className="stories-section"
        id="stories"
        aria-label={`${category.name} 글 목록`}
      >
        <CategoryNav categories={categories} current={category.id} />
        <p className="result-count">{total}개의 이야기</p>
        {posts.length ? (
          <div className="post-grid">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>아직 이 주제의 글이 없어요.</h2>
            <Link href="/" prefetch={false}>
              전체 글 보기 →
            </Link>
          </div>
        )}
        <Pagination
          page={page}
          pages={pages}
          base={categoryPath(category.slug)}
        />
      </section>
    </div>
  );
}
