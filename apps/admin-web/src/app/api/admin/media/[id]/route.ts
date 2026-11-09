import { ManagementError } from "@cloudflare-ai-blog/database";
import { coverMediaIdSchema } from "@cloudflare-ai-blog/shared";
import { getCoverBucket } from "@/lib/cover-images";
import { apiError, guard } from "@/lib/local-admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, blogId } = await guard(request);
    const id = coverMediaIdSchema.safeParse((await params).id);
    if (!id.success) throw new ManagementError(404, "이미지를 찾을 수 없어요.");
    const media = await db
      .prepare("SELECT r2_key, mime_type FROM media WHERE blog_id=? AND id=?")
      .bind(blogId, id.data)
      .first<{ r2_key: string; mime_type: string }>();
    if (!media) throw new ManagementError(404, "이미지를 찾을 수 없어요.");

    const bucket = await getCoverBucket();
    const object = await bucket.get(media.r2_key);
    if (!object)
      throw new ManagementError(404, "이미지 파일을 찾을 수 없어요.");
    return new Response(object.body, {
      headers: {
        "Content-Type": media.mime_type,
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
