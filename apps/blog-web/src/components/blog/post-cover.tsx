import type { PublishedPost } from "@cloudflare-ai-blog/database/public-blog";
import { safeImage } from "@/features/blog/content-safety";

export function postCoverSource(post: PublishedPost) {
  if (post.coverMediaId) {
    return `/media/${encodeURIComponent(post.id)}/${encodeURIComponent(post.coverMediaId)}`;
  }
  return safeImage(post.coverUrl);
}

export function PostCover({
  src,
  alt,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  // Request the media route directly so an image optimizer cannot cache a withdrawn cover.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={1200}
      height={800}
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      referrerPolicy="no-referrer"
    />
  );
}
