import { readSiteShareImage } from "@cloudflare-ai-blog/database/public-blog";
import { coverMediaIdSchema } from "@cloudflare-ai-blog/shared";
import { getPublicBindings } from "@/lib/public-blog";
import { mediaNotFound, servePublicMedia } from "@/lib/public-media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  if (!coverMediaIdSchema.safeParse(mediaId).success) return mediaNotFound();

  const { db, blogId, bucket } = await getPublicBindings();
  const media = await readSiteShareImage(db, blogId, mediaId);
  return servePublicMedia(bucket, media);
}
