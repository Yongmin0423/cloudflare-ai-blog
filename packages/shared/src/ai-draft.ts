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

export const aiDraftDiagnosticEventSchema = z.strictObject({
  at: z.number().int().positive(),
  stage: z.enum(["start", "source", "outline", "body", "check", "save"]),
  message: z.string().min(1).max(500),
  details: z.array(z.string().max(600)).max(12).optional(),
  links: z
    .array(
      z.strictObject({
        title: z.string().max(200),
        url: z.url({ protocol: /^https$/ }).max(2048),
      }),
    )
    .max(12)
    .optional(),
});
export type AiDraftDiagnosticEvent = z.infer<
  typeof aiDraftDiagnosticEventSchema
>;
export type RecordDraftDiagnostic = (
  event: Omit<AiDraftDiagnosticEvent, "at">,
) => Promise<void>;

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

export const subscriptionProviderSchema = z.enum(["chatgpt", "claude"]);
export const subscriptionArticleSchema = z.strictObject({
  provider: subscriptionProviderSchema,
  title: z.string().trim().min(1).max(200),
  introduction: z.string().trim().max(3000),
  sections: z
    .array(
      z.strictObject({
        heading: z.string().trim().min(1).max(200),
        paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
  sources: z.array(referenceUrlSchema).max(20),
});

export const agentDraftRequestSchema = aiDraftRequestSchema
  .omit({ chatGptModel: true })
  .extend({
    blogId: z.string().uuid(),
    subscriptionArticle: subscriptionArticleSchema.optional(),
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

export const subscriptionRevisionInputSchema = z.strictObject({
  title: z.string().max(200),
  instructions: aiRevisionRequestSchema.shape.instructions,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  blocks: z
    .array(
      z.strictObject({ type: z.string().max(60), text: z.string().max(20000) }),
    )
    .min(1)
    .max(300),
});
const originalIndex = z.number().int().min(0).max(299);
const alt = z.string().trim().min(1).max(500);
export const revisionImageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("source"),
    pageUrl: referenceUrlSchema,
    imageUrl: referenceUrlSchema.optional(),
    alt,
  }),
  z.strictObject({
    kind: z.literal("generate"),
    prompt: z.string().trim().min(1).max(1200),
    alt,
  }),
]);
export const subscriptionRevisionResultSchema = z.strictObject({
  layout: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("keep"), index: originalIndex }),
        z.strictObject({
          kind: z.enum(["paragraph", "heading"]),
          text: z.string().trim().min(1).max(20000),
        }),
        ...revisionImageSchema.options,
      ]),
    )
    .min(1)
    .max(350),
  removed: z.array(originalIndex).max(300),
});
export function validRevisionLayout(
  count: number,
  plan: z.infer<typeof subscriptionRevisionResultSchema>,
) {
  const indexes = [
    ...plan.removed,
    ...plan.layout.flatMap((item) =>
      item.kind === "keep" ? [item.index] : [],
    ),
  ];
  return (
    indexes.length === count &&
    new Set(indexes).size === count &&
    indexes.every((index) => index < count) &&
    plan.layout.filter(
      (item) => item.kind === "source" || item.kind === "generate",
    ).length <= 3
  );
}
export const revisionJobSchema = z.object({
  id: z.uuid(),
  provider: subscriptionProviderSchema,
  state: z.enum(["queued", "writing", "failed", "saved"]),
  error: z.string().nullable(),
  input: subscriptionRevisionInputSchema,
  result: subscriptionRevisionResultSchema.nullable(),
});
