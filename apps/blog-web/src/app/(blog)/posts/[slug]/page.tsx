import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostBody } from "@/components/blog/post-body";
import { PostCard } from "@/components/blog/post-card";
import { PostCover, postCoverSource } from "@/components/blog/post-cover";
import { categoryPath, formatDate } from "@/features/blog/content";
import {
  buildPostSeo,
  serializeStructuredData,
} from "@/features/blog/post-seo";
import {
  getPublicBlog,
  getPublicSiteOrigin,
  getPublishedPost,
  getRelatedPosts,
} from "@/lib/public-blog";

type Props = { params: Promise<{ slug: string }> };

async function loadArticle(slug: string) {
  const [post, blog] = await Promise.all([
    getPublishedPost(slug),
    getPublicBlog(),
  ]);
  if (!blog || !post) notFound();
  const cover = postCoverSource(post);
  const siteOrigin = await getPublicSiteOrigin(blog.domain);
  return {
    post,
    blog,
    cover,
    seo: buildPostSeo(post, blog, siteOrigin, cover),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seo } = await loadArticle((await params).slug);
  return seo.metadata;
}

export default async function PostPage({ params }: Props) {
  const { post, blog, cover, seo } = await loadArticle((await params).slug);

  const categoryHref = post.categorySlug
    ? categoryPath(post.categorySlug)
    : null;
  const related = post.categoryId
    ? await getRelatedPosts(post.categoryId, post.id)
    : [];
  return (
    <div className="blog-container article-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(seo.structuredData),
        }}
      />
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
            {post.contentUpdatedAt > post.publishedAt && (
              <>
                <span>·</span>
                <span>
                  수정{" "}
                  <time
                    dateTime={new Date(post.contentUpdatedAt).toISOString()}
                  >
                    {formatDate(post.contentUpdatedAt)}
                  </time>
                </span>
              </>
            )}
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
          <PostBody content={post.content} postId={post.id} />
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
