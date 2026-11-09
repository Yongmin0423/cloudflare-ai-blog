import type { JSONContent } from "@tiptap/react";

export type DraftFields = {
  title: string;
  slug: string;
  category: string;
  coverUrl: string;
  coverMediaId: string;
  coverAlt: string;
  seoTitle: string;
  seoDescription: string;
};
export type LocalDraft = {
  version: 1;
  fields: DraftFields;
  content: JSONContent;
  savedAt: string;
};
export const emptyFields: DraftFields = {
  title: "",
  slug: "",
  category: "미분류",
  coverUrl: "",
  coverMediaId: "",
  coverAlt: "",
  seoTitle: "",
  seoDescription: "",
};
export const emptyContent: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export const draftKey = (id: string) => `blog-studio:draft:v1:${id}`;
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function makeSlug(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
export function validateFields(fields: DraftFields): string[] {
  const errors: string[] = [];
  if (!fields.title.trim()) errors.push("제목을 입력해 주세요.");
  if (fields.title.length > 200)
    errors.push("제목은 200자 이내로 입력해 주세요.");
  if (
    !fields.slug ||
    !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(fields.slug) ||
    fields.slug.length > 120
  )
    errors.push(
      "슬러그는 120자 이내의 한글·영문·숫자와 단어 사이 하이픈으로 입력해 주세요.",
    );
  if (fields.coverUrl && !isWebUrl(fields.coverUrl))
    errors.push("대표 이미지에는 올바른 http 또는 https URL을 입력해 주세요.");
  if ((fields.coverUrl || fields.coverMediaId) && !fields.coverAlt.trim())
    errors.push("대표 이미지 대체 텍스트를 입력해 주세요.");
  if (fields.seoTitle.length > 100)
    errors.push("SEO 제목은 100자 이내로 입력해 주세요.");
  if (fields.seoDescription.length > 300)
    errors.push("SEO 설명은 300자 이내로 입력해 주세요.");
  return errors;
}
// Validate browser-stored JSON before giving it to the editor. The editor's schema
// separately checks node structure on restore (setContent with errorOnInvalidContent).
function safeNode(value: unknown, depth = 0): value is JSONContent {
  if (!value || typeof value !== "object" || depth > 30) return false;
  const node = value as JSONContent;
  if (
    !node.type ||
    ![
      "doc",
      "paragraph",
      "heading",
      "text",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "horizontalRule",
      "hardBreak",
      "image",
    ].includes(node.type)
  )
    return false;
  if (node.text !== undefined && typeof node.text !== "string") return false;
  if (node.type === "heading" && ![2, 3].includes(node.attrs?.level))
    return false;
  if (
    node.type === "image" &&
    (!isWebUrl(node.attrs?.src) ||
      typeof node.attrs?.alt !== "string" ||
      !node.attrs.alt.trim())
  )
    return false;
  if (
    node.marks &&
    (!Array.isArray(node.marks) ||
      !node.marks.every(
        (mark) =>
          mark &&
          ["bold", "italic", "strike", "link"].includes(mark.type) &&
          (mark.type !== "link" || isWebUrl(mark.attrs?.href)),
      ))
  )
    return false;
  return (
    node.content === undefined ||
    (Array.isArray(node.content) &&
      node.content.every((child) => safeNode(child, depth + 1)))
  );
}
export function parseLocalDraft(raw: string): LocalDraft {
  if (raw.length > 2_000_000) throw new Error("초안 크기가 너무 큽니다.");
  const value = JSON.parse(raw) as LocalDraft;
  const fields = value?.fields
    ? Object.assign({ coverMediaId: "" }, value.fields)
    : null;
  if (
    !value ||
    value.version !== 1 ||
    !fields ||
    Object.keys(emptyFields).some(
      (key) => typeof fields[key as keyof DraftFields] !== "string",
    ) ||
    typeof value.savedAt !== "string" ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    value.content?.type !== "doc" ||
    !safeNode(value.content)
  )
    throw new Error("지원하지 않거나 손상된 초안입니다.");
  return { ...value, fields };
}
export function validateContent(content: JSONContent): string[] {
  return safeNode(content)
    ? []
    : ["본문의 이미지 URL·대체 텍스트 또는 링크 주소를 확인해 주세요."];
}
