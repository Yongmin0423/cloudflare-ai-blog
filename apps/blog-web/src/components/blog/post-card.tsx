import Link from "next/link";
import type { PublishedPost } from "@cloudflare-ai-blog/database/public-blog";
import { categoryPath, formatDate, postPath } from "@/features/blog/content";
import { PostCover, postCoverSource } from "./post-cover";

export function PostCard({ post }: { post: PublishedPost }) {
  const href = postPath(post.slug);
  const cover = postCoverSource(post);
  return (
    <article className="post-card">
      {cover && (
        <Link
          href={href}
          prefetch={false}
          className="card-image"
          aria-label={`${post.title} 읽기`}
        >
          <PostCover src={cover} alt={post.coverAlt} />
        </Link>
      )}
      <div className="card-content">
        <p className="card-meta">
          {post.categorySlug && (
            <>
              <Link href={categoryPath(post.categorySlug)} prefetch={false}>
                {post.categoryName}
              </Link>
              <span>·</span>
            </>
          )}
          <time dateTime={new Date(post.publishedAt).toISOString()}>
            {formatDate(post.publishedAt)}
          </time>
        </p>
        <h3>
          <Link href={href} prefetch={false}>
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="card-excerpt">{post.excerpt}</p>}
        <Link href={href} prefetch={false} className="read-link">
          이야기 읽기 <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
