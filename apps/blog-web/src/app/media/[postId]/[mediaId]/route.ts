import { readPublishedMedia } from "@cloudflare-ai-blog/database/public-blog";
import { coverMediaIdSchema } from "@cloudflare-ai-blog/shared";
import { getPublicBindings } from "@/lib/public-blog";
import { mediaNotFound, servePublicMedia } from "@/lib/public-media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string; mediaId: string }> },
) {
  const { postId, mediaId } = await params;
  if (
    !coverMediaIdSchema.safeParse(postId).success ||
    !coverMediaIdSchema.safeParse(mediaId).success
  ) {
    return mediaNotFound();
  }
  const { db, blogId, bucket } = await getPublicBindings();
  const media = await readPublishedMedia(db, blogId, postId, mediaId);
  return servePublicMedia(bucket, media);
}
