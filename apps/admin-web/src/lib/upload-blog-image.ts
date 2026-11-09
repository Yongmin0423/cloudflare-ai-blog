import {
  coverUploadResponseSchema,
  MAX_COVER_IMAGE_BYTES,
} from "@cloudflare-ai-blog/shared";

export async function uploadBlogImage(file: File) {
  if (file.size === 0 || file.size > MAX_COVER_IMAGE_BYTES) {
    throw new Error("비어 있지 않은 5MB 이하의 이미지 파일을 선택해 주세요.");
  }

  const response = await fetch("/api/admin/media", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Image-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value
        ? value.error
        : null;
    throw new Error(
      typeof message === "string" ? message : "이미지를 업로드하지 못했어요.",
    );
  }
  return coverUploadResponseSchema.parse(value);
}
