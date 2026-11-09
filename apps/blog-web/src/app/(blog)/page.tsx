import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/blog/post-card";
import { PostCover, postCoverSource } from "@/components/blog/post-cover";
import { CategoryNav, Pagination } from "@/components/blog/list-navigation";
import { formatDate, postPath, readPage } from "@/features/blog/content";
import {
  getCategories,
  getPublicBlog,
  getPublishedPage,
} from "@/lib/public-blog";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = readPage((await searchParams).page);
  if (!page) notFound();
  const [blog, categories, result] = await Promise.all([
    getPublicBlog(),
    getCategories(),
    getPublishedPage(page),
  ]);
  if (!blog || !result) notFound();

  const { posts, total, pages } = result;
  const featured = page === 1 ? posts[0] : undefined;
  const featuredCover = featured ? postCoverSource(featured) : null;

  return (
    <div className="blog-container">
      {page === 1 ? (
        <section className="home-intro">
          <p className="eyebrow">THE JOURNAL</p>
          <h1>{blog.name}</h1>
          {blog.description && <p>{blog.description}</p>}
          <span className="intro-stamp" aria-hidden="true">
            기록하는
            <br />
            마음
          </span>
        </section>
      ) : (
        <header className="category-heading">
          <p className="eyebrow">THE JOURNAL</p>
          <h1>모든 이야기</h1>
        </header>
      )}

      {featured && featuredCover && (
        <section className="featured-post" aria-labelledby="featured-title">
          <Link
            href={postPath(featured.slug)}
            prefetch={false}
            className="featured-image"
            aria-label={`${featured.title} 읽기`}
          >
            <PostCover src={featuredCover} alt={featured.coverAlt} priority />
          </Link>
          <div className="featured-copy">
            <p className="eyebrow">{featured.categoryName || "최근 발행 글"}</p>
            <h2 id="featured-title">
              <Link href={postPath(featured.slug)} prefetch={false}>
                {featured.title}
              </Link>
            </h2>
            {featured.excerpt && <p>{featured.excerpt}</p>}
            <div className="featured-bottom">
              <time dateTime={new Date(featured.publishedAt).toISOString()}>
                {formatDate(featured.publishedAt)}
              </time>
              <Link
                href={postPath(featured.slug)}
                prefetch={false}
                className="round-link"
                aria-label="최근 발행 글 읽기"
              >
                ↗
              </Link>
            </div>
          </div>
        </section>
      )}

      <section
        className="stories-section"
        id="stories"
        aria-labelledby="stories-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE LATEST STORIES</p>
            <h2 id="stories-title">최근 글</h2>
          </div>
          <span>총 {total}개의 글</span>
        </div>
        <CategoryNav categories={categories} />
        {posts.length ? (
          <div className="post-grid">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>아직 발행된 글이 없어요.</h2>
          </div>
        )}
        <Pagination page={page} pages={pages} base="/" />
      </section>
    </div>
  );
}
