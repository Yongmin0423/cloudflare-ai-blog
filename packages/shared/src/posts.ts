import { z } from "zod";

export type EditorNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: EditorNode[];
};
export type EditorDocument = EditorNode & {
  type: "doc";
  content: EditorNode[];
};
const webUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const managedImagePrefix = "/api/admin/media/";

export function managedImageSrc(mediaId: string) {
  return managedImagePrefix + mediaId;
}

export function managedImageId(src: unknown) {
  if (typeof src !== "string" || !src.startsWith(managedImagePrefix))
    return null;
  const id = coverMediaIdSchema.safeParse(src.slice(managedImagePrefix.length));
  return id.success ? id.data : null;
}

const blocks = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "horizontalRule",
  "image",
];
function validDocument(value: unknown): value is EditorDocument {
  let nodes = 0;
  function check(value: unknown, depth: number, parent: string): boolean {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 30 ||
      ++nodes > 10_000
    )
      return false;
    const n = value as EditorNode;
    if (
      Object.keys(n).some(
        (k) => !["type", "text", "attrs", "marks", "content"].includes(k),
      )
    )
      return false;
    if (
      typeof n.type !== "string" ||
      (n.attrs !== undefined &&
        (!n.attrs || typeof n.attrs !== "object" || Array.isArray(n.attrs)))
    )
      return false;
    if (
      parent === "root"
        ? n.type !== "doc"
        : parent === "paragraph" || parent === "heading"
          ? !["text", "hardBreak"].includes(n.type)
          : parent === "bulletList" || parent === "orderedList"
            ? n.type !== "listItem"
            : !blocks.includes(n.type)
    )
      return false;
    if (
      n.text !== undefined &&
      (n.type !== "text" || typeof n.text !== "string" || !n.text.length)
    )
      return false;
    if (n.type === "text" && !n.text) return false;
    if (n.type === "heading" && n.attrs?.level !== 2 && n.attrs?.level !== 3)
      return false;
    if (
      n.type === "image" &&
      ((!webUrl(n.attrs?.src) && !managedImageId(n.attrs?.src)) ||
        typeof n.attrs?.alt !== "string" ||
        !n.attrs.alt.trim() ||
        (managedImageId(n.attrs.src) && n.attrs.alt.trim().length > 500))
    )
      return false;
    if (
      n.marks !== undefined &&
      (!Array.isArray(n.marks) ||
        !["text", "hardBreak"].includes(n.type) ||
        !n.marks.every(
          (m) =>
            m &&
            ["bold", "italic", "strike", "link"].includes(m.type) &&
            (m.type !== "link" || webUrl(m.attrs?.href)),
        ))
    )
      return false;
    if (["text", "hardBreak", "horizontalRule", "image"].includes(n.type))
      return n.content === undefined;
    if (n.content !== undefined && !Array.isArray(n.content)) return false;
    const children = n.content ?? [];
    if (
      ["doc", "blockquote", "listItem", "bulletList", "orderedList"].includes(
        n.type,
      ) &&
      !children.length
    )
      return false;
    if (n.type === "listItem" && children[0]?.type !== "paragraph")
      return false;
    return children.every((child) => check(child, depth + 1, n.type));
  }
  return check(value, 0, "root");
}
export const documentSchema = z
  .custom<EditorDocument>(
    validDocument,
    "지원하지 않는 본문 형식·링크·이미지예요.",
  )
  .refine(
    (value) =>
      !validDocument(value) ||
      new TextEncoder().encode(JSON.stringify(value)).length <= 200_000,
    "본문은 JSON 기준 200KB까지 저장할 수 있어요.",
  );
export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
export const coverMediaIdSchema = z.string().uuid();
export const coverUploadResponseSchema = z.object({
  mediaId: coverMediaIdSchema,
});
export const postInputSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .transform((v) => v.normalize("NFC").trim().toLowerCase())
      .pipe(
        z
          .string()
          .min(1)
          .max(120)
          .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u),
      ),
    categoryId: z.string().uuid().nullable(),
    content: documentSchema,
    coverUrl: z
      .string()
      .max(2048)
      .refine((v) => !v || webUrl(v), "대표 이미지 URL을 확인해 주세요."),
    coverMediaId: coverMediaIdSchema.nullable().optional(),
    coverAlt: z.string().trim().max(500),
    seoTitle: z.string().trim().max(100),
    seoDescription: z.string().trim().max(300),
  })
  .refine((v) => !(v.coverUrl && v.coverMediaId), {
    message: "업로드 파일과 외부 URL 중 하나를 선택해 주세요.",
    path: ["coverUrl"],
  })
  .refine((v) => !(v.coverUrl || v.coverMediaId) || !!v.coverAlt, {
    message: "대표 이미지 대체 텍스트를 입력해 주세요.",
    path: ["coverAlt"],
  });
export type PostInput = z.infer<typeof postInputSchema>;

const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("https://") && webUrl(value));
export const sourceImageSchema = z.object({
  url: httpsUrl,
  pageUrl: httpsUrl,
  title: z.string().max(250),
  alt: z.string().max(500),
  caption: z.string().max(500),
  creator: z.string().max(250),
  license: z.enum(["CC0 1.0", "CC BY 4.0"]).nullable(),
});
export const sourceImagesSchema = z.array(sourceImageSchema).max(24);
export type SourceImage = z.infer<typeof sourceImageSchema>;

const imageLicenseUrls = {
  "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
};

function imageSourceLink(text: string, href: string): EditorNode {
  return { type: "text", text, marks: [{ type: "link", attrs: { href } }] };
}

export function sourceImageCredit(
  image: SourceImage,
  isCover = false,
): EditorNode {
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text:
          (isCover ? "대표 이미지" : "이미지") +
          (image.caption ? ` · ${image.caption} · ` : " · "),
      },
      imageSourceLink(
        image.creator || image.title || new URL(image.pageUrl).hostname,
        image.pageUrl,
      ),
      ...(image.license
        ? [
            { type: "text", text: " · " },
            imageSourceLink(image.license, imageLicenseUrls[image.license]),
          ]
        : []),
    ],
  };
}
export const postDetailSchema = postInputSchema.safeExtend({
  id: z.string().uuid(),
  status: z.enum(["draft", "published", "private"]),
  origin: z.enum(["manual", "ai"]),
  sourceImages: sourceImagesSchema.default([]),
  revision: z.number().int().positive(),
  publishedAt: z.number().int().positive().nullable(),
  updatedAt: z.number().int().positive(),
});
export type PostDetail = z.infer<typeof postDetailSchema>;
export const postResponseSchema = z.object({ post: postDetailSchema });
export const updatePostSchema = z.strictObject({
  post: postInputSchema,
  expectedRevision: z.number().int().positive(),
});
export const deletePostDraftSchema = z.strictObject({
  expectedRevision: updatePostSchema.shape.expectedRevision,
});
export const postPublicationSchema = z.strictObject({
  status: z.enum(["published", "private"]),
  expectedRevision: z.number().int().positive(),
});
export type PostPublication = z.infer<typeof postPublicationSchema>;
export const postPublicationResponseSchema = z.object({
  status: postPublicationSchema.shape.status,
  revision: postDetailSchema.shape.revision,
  publishedAt: z.number().int().positive(),
});
export const postListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "draft", "published", "private"]).default("all"),
  category: z
    .union([z.literal("all"), z.literal("uncategorized"), z.string().uuid()])
    .default("all"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
export type PostListQuery = z.infer<typeof postListQuerySchema>;
const detail = postDetailSchema.shape;
const postOverviewSchema = z.object({
  id: detail.id,
  title: detail.title,
  status: detail.status,
  updatedAt: detail.updatedAt,
  category: z.string(),
});
const postCountSchema = z.number().int().nonnegative();
export const postDashboardResponseSchema = z.object({
  counts: z.object({
    total: postCountSchema,
    draft: postCountSchema,
    published: postCountSchema,
    private: postCountSchema,
  }),
  recentPosts: z.array(postOverviewSchema).max(5),
});
export const postListResponseSchema = z.object({
  posts: z.array(
    postOverviewSchema.extend({
      slug: detail.slug,
      categoryId: detail.categoryId,
      origin: detail.origin,
      revision: detail.revision,
    }),
  ),
  total: postCountSchema,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
