import { z } from "zod";

export const aiDraftSubjectTypeSchema = z.enum([
  "general",
  "film",
  "tv",
  "game",
  "book",
  "product",
  "software",
  "person",
  "organization",
  "place",
  "event",
  "other",
]);

export const aiDraftSubjectSchema = z.strictObject({
  name: z.string().trim().min(1, "대상 이름을 입력해 주세요.").max(150),
  type: aiDraftSubjectTypeSchema,
});

export const aiDraftSubjectSuggestionSchema = aiDraftSubjectSchema.extend({
  type: aiDraftSubjectTypeSchema.nullable(),
});

export const aiDraftReferenceUrlLimit = 5;
export const aiDraftReferenceUrlMaxLength = 2000;

const referenceUrlSchema = z
  .string()
  .trim()
  .max(aiDraftReferenceUrlMaxLength, "참고 URL이 너무 길어요.")
  .pipe(
    z.url({
      protocol: /^https$/,
      hostname: z.regexes.domain,
      normalize: true,
      error: "https://로 시작하는 공개 페이지 주소를 입력해 주세요.",
    }),
  )
  .refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      url.href.length <= aiDraftReferenceUrlMaxLength
    );
  }, "로그인 정보가 없는 공개 페이지 주소를 입력해 주세요.");

export const aiDraftBodyProviderSchema = z.enum(["openai", "anthropic"]);
export type AiDraftBodyProvider = z.infer<typeof aiDraftBodyProviderSchema>;
export const aiDraftBodyModels = [
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna" },
  { id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini" },
  { id: "gpt-6.1-terra", provider: "openai", label: "GPT-6.1 Terra" },
  { id: "gpt-6.2-sol", provider: "openai", label: "GPT-6.2 Sol" },
  { id: "gpt-6.2-astra", provider: "openai", label: "GPT-6.2 Astra" },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5" },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
  },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5" },
] as const;
export const aiDraftBodyModelSchema = z.enum(
  aiDraftBodyModels.map(({ id }) => id),
);
export type AiDraftBodyModel = z.infer<typeof aiDraftBodyModelSchema>;
export function draftProviderForModel(model: AiDraftBodyModel) {
  return aiDraftBodyModels.find(({ id }) => id === model)!.provider;
}
export const aiDraftProvidersResponseSchema = z.strictObject({
  providers: z
    .array(
      z.strictObject({
        provider: aiDraftBodyProviderSchema,
        status: z.enum(["unconfigured", "ready", "unavailable"]),
        models: z.array(aiDraftBodyModelSchema).max(aiDraftBodyModels.length),
      }),
    )
    .max(2),
});

export const aiDraftRequestSchema = z.strictObject({
  requestId: z.string().uuid(),
  keyword: z.string().trim().min(1, "키워드를 입력해 주세요.").max(100),
  categoryId: z.string().uuid().nullable(),
  instructions: z.string().trim().max(2000),
  referenceUrls: z
    .array(referenceUrlSchema)
    .max(aiDraftReferenceUrlLimit, "참고 URL은 최대 5개까지 추가할 수 있어요.")
    .optional(),
  subject: aiDraftSubjectSchema.optional(),
  bodyModel: aiDraftBodyModelSchema.optional(),
  chatGptModel: z.string().trim().min(1).max(100).optional(),
});

export const agentDraftRequestSchema = aiDraftRequestSchema
  .omit({ chatGptModel: true })
  .extend({
    blogId: z.string().uuid(),
    chatGptTicket: z
      .string()
      .regex(/^[\w-]{43}$/)
      .optional(),
  });

export const chatGptStatusSchema = z.object({
  email: z.string().nullable(),
  models: z.array(z.object({ slug: z.string(), name: z.string() })),
});

export const aiRevisionRequestSchema = z.strictObject({
  model: z.string().trim().min(1).max(100),
  title: z.string().trim().max(200),
  context: z.string().max(12_000),
  selection: z.string().trim().min(1).max(2500),
  instructions: z
    .string()
    .trim()
    .min(1, "수정 지시를 입력해 주세요.")
    .max(1000),
});

export const aiRevisionResponseSchema = z.strictObject({
  revisedText: z.string().trim().min(1).max(4000),
});

export const aiDraftResponseSchema = z.union([
  z.strictObject({
    subjectToConfirm: aiDraftSubjectSuggestionSchema,
  }),
  z.strictObject({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
  }),
]);

export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;
export type AgentDraftRequest = Omit<
  z.infer<typeof agentDraftRequestSchema>,
  "blogId"
>;
export type AiDraftSubject = z.infer<typeof aiDraftSubjectSchema>;
export type AiDraftSubjectSuggestion = z.infer<
  typeof aiDraftSubjectSuggestionSchema
>;
export type AiDraftSubjectType = z.infer<typeof aiDraftSubjectTypeSchema>;
