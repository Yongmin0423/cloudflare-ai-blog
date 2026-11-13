import { z } from "zod";

export const postQaRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});

export const agentPostQaRequestSchema = postQaRequestSchema.extend({
  blogId: z.string().uuid(),
  postId: z.string().uuid(),
});

export const postQaIssueSchema = z.strictObject({
  excerpt: z.string().trim().min(1).max(280),
  reason: z.string().trim().min(1).max(450),
  sources: z.array(z.url({ protocol: /^https?$/ })).max(8),
});

export const postQaReviewSchema = z.strictObject({
  revision: postQaRequestSchema.shape.expectedRevision,
  reviewedAt: z.number().int().positive(),
  issues: z.array(postQaIssueSchema).max(20),
});

export const postQaResponseSchema = z.strictObject({
  review: postQaReviewSchema.nullable(),
});

export type PostQaIssue = z.infer<typeof postQaIssueSchema>;
export type PostQaReview = z.infer<typeof postQaReviewSchema>;
