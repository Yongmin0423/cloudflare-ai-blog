import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ManagementError } from "@cloudflare-ai-blog/database";
import { MAX_COVER_IMAGE_BYTES } from "@cloudflare-ai-blog/shared";

export async function getCoverBucket() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.BLOG_MEDIA)
    throw new ManagementError(503, "이미지 저장소 연결을 확인해 주세요.");
  return env.BLOG_MEDIA;
}

export async function readCoverImage(request: Request) {
  const tooLarge = () =>
    new ManagementError(413, "대표 이미지는 5MB까지 업로드할 수 있어요.");
  if (Number(request.headers.get("content-length")) > MAX_COVER_IMAGE_BYTES)
    throw tooLarge();

  const reader = request.body?.getReader();
  if (!reader) throw new ManagementError(400, "업로드할 이미지가 없어요.");

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_COVER_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new ManagementError(400, "업로드할 이미지가 없어요.");

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // 파일명이나 브라우저가 보낸 MIME이 아니라 파일 시그니처로 응답 MIME을 결정한다.
  const format = detectImage(bytes);
  if (!format)
    throw new ManagementError(
      415,
      "JPG, PNG, WebP 이미지 파일만 업로드할 수 있어요.",
    );
  return { bytes, ...format };
}

function detectImage(bytes: Uint8Array) {
  const matches = (offset: number, signature: number[]) =>
    signature.every((value, index) => bytes[offset + index] === value);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 4 &&
    matches(0, [0xff, 0xd8, 0xff]) &&
    matches(bytes.length - 2, [0xff, 0xd9])
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 45 &&
    matches(0, [137, 80, 78, 71, 13, 10, 26, 10]) &&
    view.getUint32(8) === 13 &&
    matches(12, [73, 72, 68, 82]) &&
    view.getUint32(16) > 0 &&
    view.getUint32(20) > 0 &&
    matches(bytes.length - 12, [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 20 &&
    matches(0, [82, 73, 70, 70]) &&
    view.getUint32(4, true) === bytes.length - 8 &&
    matches(8, [87, 69, 66, 80, 86, 80, 56]) &&
    [32, 76, 88].includes(bytes[15]) &&
    view.getUint32(16, true) > 0 &&
    view.getUint32(16, true) <= bytes.length - 20
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
}

export function originalCoverName(
  encodedName: string | null,
  extension: string,
) {
  if (encodedName && encodedName.length <= 4096) {
    try {
      const name = decodeURIComponent(encodedName)
        .split(/[\\/]/)
        .at(-1)
        ?.trim()
        .slice(0, 255);
      if (name && !Array.from(name).some((char) => char.charCodeAt(0) < 32))
        return name;
    } catch {
      // The original filename is metadata only. Use a generated name if it cannot be decoded.
    }
  }
  return `image.${extension}`;
}
