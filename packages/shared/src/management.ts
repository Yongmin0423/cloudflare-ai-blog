import { z } from "zod";
import { coverMediaIdSchema } from "./posts";
const normalized = (max: number) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1, "필수 항목을 입력해 주세요.")
        .max(max, `최대 ${max}자까지 입력할 수 있어요.`),
    );
const timestamp = z.number().int().positive();
const blogSeoSchema = z
  .strictObject({
    title: z.string().trim().max(100),
    description: z.string().trim().max(300),
    shareMediaId: coverMediaIdSchema.nullable(),
    shareImageAlt: z.string().trim().max(500),
  })
  .refine(
    (seo) =>
      seo.shareMediaId
        ? seo.shareImageAlt.length > 0
        : seo.shareImageAlt === "",
    {
      path: ["shareImageAlt"],
      message: "기본 공유 이미지의 대체 텍스트를 확인해 주세요.",
    },
  );

const baseSettingsSchema = z.strictObject({
  name: normalized(80),
  description: z.string().max(300),
  language: z.enum(["ko", "en", "ja"]),
  topic: z.string().max(300),
  audience: z.string().max(300),
  tone: z.string().max(300),
  rules: z.string().max(3000),
  avoid: z.string().max(3000),
});
export const settingsSchema = baseSettingsSchema.extend({ seo: blogSeoSchema });
export type BlogSettings = z.infer<typeof settingsSchema>;
export const categoryInputSchema = z.strictObject({
  name: normalized(40).refine(
    (value) => value !== "미분류",
    "미분류는 기본 분류이므로 다른 이름을 입력해 주세요.",
  ),
  slug: z
    .string()
    .transform((value) => value.normalize("NFC").trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u,
          "슬러그에는 한글·영문·숫자와 단어 사이 하이픈을 사용해 주세요.",
        ),
    ),
  description: z.string().max(300),
  order: z.number().int().min(1).max(999),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryRecordSchema = categoryInputSchema.extend({
  id: z.string().uuid(),
  updatedAt: timestamp,
  postCount: z.number().int().nonnegative(),
});
export type CategoryRecord = z.infer<typeof categoryRecordSchema>;
export const categoriesResponseSchema = z.object({
  categories: z.array(categoryRecordSchema),
});
export const settingsResponseSchema = z.object({
  settings: settingsSchema,
  updatedAt: timestamp,
});
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export const blogSettingsInputSchema = baseSettingsSchema.extend({
  seo: blogSeoSchema.optional(),
});
export const updateSettingsSchema = z.strictObject({
  settings: blogSettingsInputSchema,
  expectedUpdatedAt: timestamp,
});
export type BlogSettingsInput = z.infer<typeof blogSettingsInputSchema>;
export const updateCategorySchema = z.strictObject({
  category: categoryInputSchema,
  expectedUpdatedAt: timestamp,
});
export const deleteCategorySchema = z.strictObject({
  expectedUpdatedAt: timestamp,
});
export function validationMessages(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}
export { ZodError, type ZodType } from "zod";
export * from "./posts";
export * from "./ai-draft";
export * from "./post-qa";
export * from "./post-seo";
