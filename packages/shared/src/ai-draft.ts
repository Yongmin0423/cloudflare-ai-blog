import { z } from "zod";

export const aiDraftRequestSchema = z.strictObject({
  requestId: z.string().uuid(),
  keyword: z.string().trim().min(1, "키워드를 입력해 주세요.").max(100),
  categoryId: z.string().uuid().nullable(),
  instructions: z.string().trim().max(2000),
});

export const agentDraftRequestSchema = aiDraftRequestSchema.extend({
  blogId: z.string().uuid(),
});

export const aiDraftResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;
