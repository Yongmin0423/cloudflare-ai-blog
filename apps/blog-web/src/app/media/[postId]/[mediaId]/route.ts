import { readPublishedCover } from "@cloudflare-ai-blog/database/public-blog";
import { coverMediaIdSchema } from "@cloudflare-ai-blog/shared";
import { getPublicBindings } from "@/lib/public-blog";

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string; mediaId: string }> },
) {
  const { postId, mediaId } = await params;
  if (
    !coverMediaIdSchema.safeParse(postId).success ||
    !coverMediaIdSchema.safeParse(mediaId).success
  ) {
    return new Response(null, { status: 404, headers: noStore });
  }
  const { db, blogId, bucket } = await getPublicBindings();
  const media = await readPublishedCover(db, blogId, postId, mediaId);
  if (!media) return new Response(null, { status: 404, headers: noStore });
  if (!bucket) throw new Error("R2 binding BLOG_MEDIA is unavailable");
  const object = await bucket.get(media.key);
  if (!object) return new Response(null, { status: 404, headers: noStore });
  return new Response(object.body, {
    headers: {
      ...noStore,
      "Content-Type": media.mimeType,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
