import { z } from "zod";
import { postDetailSchema, postInputSchema } from "./posts";

export const postSeoRequestSchema = z.strictObject({
  expectedRevision: postDetailSchema.shape.revision,
});

export const agentPostSeoRequestSchema = postSeoRequestSchema.extend({
  blogId: z.string().uuid(),
  postId: postDetailSchema.shape.id,
});

export const postSeoSuggestionSchema = z.strictObject({
  seoTitle: postInputSchema.shape.seoTitle.min(1),
  seoDescription: postInputSchema.shape.seoDescription.min(1),
});

export const postSeoResponseSchema = z.strictObject({
  revision: postDetailSchema.shape.revision,
  suggestion: postSeoSuggestionSchema,
});

export type PostSeoSuggestion = z.infer<typeof postSeoSuggestionSchema>;
