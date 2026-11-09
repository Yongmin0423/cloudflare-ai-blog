import { apiError, guard, json } from "@/lib/local-admin";
import {
  getCoverBucket,
  originalCoverName,
  readCoverImage,
} from "@/lib/cover-images";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { db, blogId } = await guard(request, "application/octet-stream");
    const { bytes, mimeType, extension } = await readCoverImage(request);
    const bucket = await getCoverBucket();
    const mediaId = crypto.randomUUID();
    const key = `covers/${blogId}/${mediaId}.${extension}`;
    const originalName = originalCoverName(
      request.headers.get("x-image-name"),
      extension,
    );

    await bucket.put(key, bytes, { httpMetadata: { contentType: mimeType } });
    try {
      await db
        .prepare(
          `INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes)
        VALUES(?,?,?,?,?,?)`,
        )
        .bind(mediaId, blogId, key, originalName, mimeType, bytes.byteLength)
        .run();
    } catch (error) {
      // R2와 D1은 같은 트랜잭션을 쓸 수 없으므로 등록에 실패한 업로드를 정리한다.
      await bucket
        .delete(key)
        .catch(() =>
          console.error("Failed to clean up unregistered cover image"),
        );
      throw error;
    }
    return json({ mediaId }, 201);
  } catch (error) {
    return apiError(error);
  }
}
