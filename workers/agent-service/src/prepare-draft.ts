import { postInputSchema, type EditorNode } from "@cloudflare-ai-blog/shared";
import { generateDraft } from "./generate-draft";
import { suggestPostSeo } from "./suggest-post-seo";

export async function prepareDraft(
  ...[env, request, settings, category, onSources, record]: Parameters<
    typeof generateDraft
  >
) {
  const article = request.subscriptionArticle;
  if (article) {
    await record?.({
      stage: "body",
      message:
        article.provider === "claude"
          ? "Claude Code 구독에서 작성한 본문"
          : "로컬 Codex의 ChatGPT 구독으로 작성한 본문",
    });
    const paragraph = (text: string): EditorNode => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const nodes: EditorNode[] = article.introduction
      ? [paragraph(article.introduction)]
      : [];
    for (const section of article.sections) {
      nodes.push(
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: section.heading }],
        },
        ...section.paragraphs.map(paragraph),
      );
    }
    for (const url of article.sources)
      nodes.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: url,
            marks: [{ type: "link", attrs: { href: url } }],
          },
        ],
      });
    await record?.({
      stage: "source",
      message: `작성자가 첨부한 출처 ${article.sources.length}개 · 원문 대조 미실행`,
    });
    const draft = postInputSchema.parse({
      title: article.title,
      slug: `draft-${request.requestId}`,
      categoryId: request.categoryId,
      content: { type: "doc", content: nodes },
      coverUrl: "",
      coverAlt: "",
      seoTitle: "",
      seoDescription: "",
    });
    return { ...draft, ...(await suggestPostSeo(env, draft)) };
  }
  const draft = await generateDraft(
    env,
    request,
    settings,
    category,
    onSources,
    record,
  );
  await record?.({ stage: "save", message: "SEO 제목·설명 제안 생성" });
  const seo = await suggestPostSeo(env, draft);
  return { ...draft, ...seo };
}
