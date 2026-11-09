import "server-only";

const noStore = { "Cache-Control": "no-store" };

export function mediaNotFound() {
  return new Response(null, { status: 404, headers: noStore });
}

export async function servePublicMedia(
  bucket: CloudflareEnv["BLOG_MEDIA"] | undefined,
  media: { key: string; mimeType: string } | null,
) {
  if (!media) return mediaNotFound();
  if (!bucket) throw new Error("R2 binding BLOG_MEDIA is unavailable");
  const object = await bucket.get(media.key);
  if (!object) return mediaNotFound();
  return new Response(object.body, {
    headers: {
      ...noStore,
      "Content-Type": media.mimeType,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
