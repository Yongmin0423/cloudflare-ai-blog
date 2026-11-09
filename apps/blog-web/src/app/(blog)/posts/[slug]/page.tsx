import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostBody } from "@/components/blog/post-body";
import { PostCard } from "@/components/blog/post-card";
import { PostCover, postCoverSource } from "@/components/blog/post-cover";
import { categoryPath, formatDate } from "@/features/blog/content";
import {
  getPublicBlog,
  getPublishedPost,
  getRelatedPosts,
} from "@/lib/public-blog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();
  return { title: post.title, description: post.excerpt || undefined };
}

export default async function PostPage({ params }: Props) {
  const [{ slug }, blog] = await Promise.all([params, getPublicBlog()]);
  const post = await getPublishedPost(slug);
  if (!blog || !post) notFound();

  const categoryHref = post.categorySlug
    ? categoryPath(post.categorySlug)
    : null;
  const related = post.categoryId
    ? await getRelatedPosts(post.categoryId, post.id)
    : [];
  const cover = postCoverSource(post);

  return (
    <div className="blog-container article-page">
      <div className="page-breadcrumb">
        <Link href="/" prefetch={false}>
          홈
        </Link>
        {categoryHref && (
          <>
            <span>/</span>
            <Link href={categoryHref} prefetch={false}>
              {post.categoryName}
            </Link>
          </>
        )}
      </div>
      <article>
        <header className="article-heading">
          {categoryHref && (
            <Link
              className="article-category"
              href={categoryHref}
              prefetch={false}
            >
              {post.categoryName}
            </Link>
          )}
          <h1>{post.title}</h1>
          {post.excerpt && <p className="article-excerpt">{post.excerpt}</p>}
          <p className="article-meta">
            <span>{blog.name}</span>
            <span>·</span>
            <time dateTime={new Date(post.publishedAt).toISOString()}>
              {formatDate(post.publishedAt)}
            </time>
          </p>
        </header>
        {cover && (
          <PostCover
            className="article-cover"
            src={cover}
            alt={post.coverAlt}
            priority
          />
        )}
        <div className="article-body">
          <PostBody content={post.content} />
          <Link
            className="back-link"
            href={categoryHref ?? "/"}
            prefetch={false}
          >
            ←{" "}
            {categoryHref ? `${post.categoryName} 글 더 보기` : "전체 글 보기"}
          </Link>
        </div>
      </article>
      {related.length > 0 && (
        <section className="related-section" aria-labelledby="related-title">
          <div className="section-heading">
            <h2 id="related-title">함께 읽으면 좋은 이야기</h2>
          </div>
          <div className="post-grid">
            {related.map((item) => (
              <PostCard key={item.id} post={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
