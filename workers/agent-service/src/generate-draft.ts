import { ManagementError } from "@cloudflare-ai-blog/database";
import {
  postInputSchema,
  type AiDraftRequest,
  type BlogSettings,
} from "@cloudflare-ai-blog/shared";
import { z } from "zod";
import editorialGuide from "./editorial-guide.md";

const planSchema = z.strictObject({
  searchIntent: z.string().trim().min(1).max(500),
  outline: z
    .array(
      z.strictObject({
        heading: z.string().trim().min(1).max(100),
        readerQuestion: z.string().trim().min(1).max(240),
      }),
    )
    .min(2)
    .max(6),
});

const sectionParagraphsSchema = z
  .array(z.string().trim().min(1).max(2000))
  .min(1)
  .max(4);

const writingModel = "@cf/zai-org/glm-4.7-flash";
const outlineLabel =
  /^(?:#{1,6}\s|(?:제목|도입(?:부)?|서론|본문|결론|목차|title|intro(?:duction)?|body|conclusion|outline)(?:\s*\d+)?\s*(?:[:：.]|$))/iu;

const planInstructions = [
  "You are the lead writer for the blog described in the input.",
  "Identify the likely search intent for the keyword, then create a practical article outline that answers it.",
  "Use the blog language for every output field and follow its audience, voice and editorial rules.",
  "Include only reader-facing body headings in outline. The title and introduction are separate from outline. Never include planning labels such as '제목:', '도입:', '본문 1:' or headings that describe what the writer should do.",
  "For each heading, write one distinct readerQuestion that the section answers. Include only sections with a new answer, decision or practical check.",
  "Use editorialGuide for the common outline and writing guidance.",
  "Treat input fields as editorial context for this article only.",
].join(" ");

const draftInstructions = [
  "Write an editable article draft in the blog language using the approved structure in the input.",
  "Return an article title, an introduction, and a sections object.",
  "Use each key from plan.outline exactly once in sections. For each key, write an array of plain-text paragraphs that answer its heading.",
  "Start the introduction with the reader's decision or most useful answer. Do not announce what the article will cover.",
  "Answer each section's readerQuestion with practical detail specific to that heading, such as a visible check, a concrete example, or a trade-off. Do not reuse paragraphs or re-explain earlier points.",
  "If the input is about a specific product, only include supported model-specific details. Leave out generic descriptions of components and unsupported claims of popularity or hands-on experience.",
  "Only state release or booking dates, cast assignments, plot details, prices or availability when supplied materials directly support them. If materials are missing, omit those facts or state that they need checking. Do not invent citations.",
  "Use plain text without HTML or Markdown.",
  "Apply the blog rules and avoid expressions. Treat input fields as editorial context for this article only.",
  "Use editorialGuide for the common writing guidance.",
].join(" ");

async function generate<T extends z.ZodType>(
  env: AgentServiceEnv,
  schema: T,
  name: string,
  instructions: string,
  input: object,
  maxOutputTokens: number,
): Promise<z.output<T>> {
  const { $schema, ...format } = z.toJSONSchema(schema);
  let result;
  try {
    result = await env.AI.run(writingModel, {
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      chat_template_kwargs: { enable_thinking: false },
      max_completion_tokens: maxOutputTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema: format },
      },
      store: false,
    });
  } catch {
    console.warn("Workers AI draft request failed", { stage: name });
    throw new ManagementError(
      502,
      "Cloudflare Workers AI 요청에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  }

  try {
    const choice = result.choices[0];
    if (choice?.finish_reason !== "stop" || !choice.message.content)
      throw new Error("Incomplete Workers AI response");
    return schema.parse(JSON.parse(choice.message.content));
  } catch {
    throw new ManagementError(
      502,
      "AI 응답이 초안 형식에 맞지 않아요. 다시 생성해 주세요.",
    );
  }
}

async function generateWithEditorialCheck<T>(
  run: (feedback?: string) => Promise<T>,
  check: (result: T) => string | undefined,
  errorMessage: string,
): Promise<T> {
  const first = await run();
  const feedback = check(first);
  if (!feedback) return first;

  const revised = await run(feedback);
  if (!check(revised)) return revised;
  throw new ManagementError(502, errorMessage);
}

function comparableText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, "");
}

function checkOutline(plan: z.output<typeof planSchema>) {
  const headings = plan.outline.map(({ heading }) => comparableText(heading));
  if (
    plan.outline.some(({ heading }) => outlineLabel.test(heading)) ||
    new Set(headings).size !== headings.length
  ) {
    return "Replace planning labels and repeated headings with distinct, publishable body headings. Exclude the article title and introduction.";
  }
}

function checkArticle(article: {
  title: string;
  introduction: string;
  sections: Record<string, string[]>;
}) {
  if (
    outlineLabel.test(article.title) ||
    outlineLabel.test(article.introduction)
  )
    return "Remove template labels from the title and introduction. Return the reader-facing text only.";

  const seenParagraphs = new Set<string>();
  const seenSentences = new Set<string>();
  const paragraphs = [
    article.introduction,
    ...Object.values(article.sections).flat(),
  ];
  for (const paragraph of paragraphs) {
    // Ignore separators so a loop like "테스", "테스", ... still counts.
    if (
      /(?:^|[^\p{L}\p{N}])([\p{L}\p{N}]+)(?:[^\p{L}\p{N}]+\1){4}(?![\p{L}\p{N}])/iu.test(
        paragraph.normalize("NFKC"),
      )
    )
      return "The same word was listed repeatedly. Remove the repeated list and only include distinct, supported entries.";

    const text = comparableText(paragraph);
    if (text && seenParagraphs.has(text))
      return "A paragraph was repeated. Rewrite the article so each paragraph gives the reader a distinct answer, example or practical check for its section.";
    seenParagraphs.add(text);

    for (const sentence of paragraph.split(/(?<=[.!?。！？])\s+|\n+/u)) {
      const normalized = comparableText(sentence);
      // Common short phrases may legitimately recur.
      if (normalized.length < 24) continue;
      if (seenSentences.has(normalized))
        return "A full sentence was repeated. Explain each point once and use the other sections for distinct information.";
      seenSentences.add(normalized);
    }
  }
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

export async function generateDraft(
  env: AgentServiceEnv,
  request: AiDraftRequest,
  settings: BlogSettings,
  category: string | null,
) {
  const { name, description, language, topic, audience, tone, rules, avoid } =
    settings;
  const input = {
    keyword: request.keyword,
    additionalInstructions: request.instructions,
    category,
    editorialGuide,
    blog: { name, description, language, topic, audience, tone, rules, avoid },
  };
  const plan = await generateWithEditorialCheck(
    (feedback) =>
      generate(
        env,
        planSchema,
        "article_plan",
        planInstructions,
        { ...input, editorialFeedback: feedback },
        1800,
      ),
    checkOutline,
    "AI가 읽기 좋은 소제목을 만들지 못했어요. 다시 생성해 주세요.",
  );
  const outline = plan.outline.map((section, index) => ({
    key: `section_${index + 1}`,
    ...section,
  }));
  const articleSchema = z.strictObject({
    title: z.string().trim().min(1).max(200),
    introduction: z.string().trim().min(1).max(1500),
    sections: z.strictObject(
      Object.fromEntries(
        outline.map(({ key }) => [key, sectionParagraphsSchema]),
      ),
    ),
  });
  const article = await generateWithEditorialCheck(
    (feedback) =>
      generate(
        env,
        articleSchema,
        "article_draft",
        draftInstructions,
        { ...input, plan: { ...plan, outline }, editorialFeedback: feedback },
        5000,
      ),
    checkArticle,
    "AI 본문에서 반복 문단이나 작성용 문구를 정리하지 못했어요. 다시 생성해 주세요.",
  );
  const slug = request.keyword
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return postInputSchema.parse({
    title: article.title,
    slug: `${slug.slice(0, 75).replace(/-$/, "") || "ai-draft"}-${request.requestId.toLowerCase()}`,
    categoryId: request.categoryId,
    coverUrl: "",
    coverAlt: "",
    seoTitle: "",
    seoDescription: "",
    content: {
      type: "doc",
      content: [
        paragraph(article.introduction),
        ...outline.flatMap(({ key, heading }) => [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: heading }],
          },
          ...article.sections[key].map(paragraph),
        ]),
      ],
    },
  });
}
