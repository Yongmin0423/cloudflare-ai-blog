import { ManagementError } from "@cloudflare-ai-blog/database";
import type { EditorNode } from "@cloudflare-ai-blog/shared";
import { z } from "zod";
import type { SourcePage } from "./research-sources";

export const evidenceSchema = z.strictObject({
  sourceId: z.string().min(1).max(30),
  quote: z.string().trim().min(20).max(800),
  scope: z.string().trim().min(1).max(120).nullable(),
  announcedOn: z.string().trim().min(1).max(80).nullable(),
});

function normalizeQuote(text: string) {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function matchEvidence(
  entries: z.infer<typeof evidenceSchema>[],
  pages: SourcePage[],
) {
  const evidence = new Map<string, Evidence>();
  const seen = new Set<string>();
  const sources = new Map(pages.map((page) => [page.id, page]));

  for (const entry of entries) {
    const page = sources.get(entry.sourceId);
    if (!page) continue;
    const text = normalizeQuote(page.text);
    const quote = normalizeQuote(entry.quote);
    const key = `${page.id}:${quote}`;
    if (quote.length < 20 || !text.includes(quote) || seen.has(key)) continue;
    seen.add(key);
    const announcedOn =
      entry.announcedOn && text.includes(normalizeQuote(entry.announcedOn))
        ? entry.announcedOn
        : null;
    evidence.set(`e${evidence.size + 1}`, {
      ...entry,
      announcedOn,
      scope:
        entry.scope && text.includes(normalizeQuote(entry.scope))
          ? entry.scope
          : null,
      sourceTitle: page.title,
      sourceUrl: page.url,
      sourceProvided: page.provided,
    });
  }

  if (!evidence.size)
    throw new ManagementError(
      422,
      "공식 원문에서 글을 뒷받침할 근거를 확인하지 못했어요. 키워드를 구체화해 다시 시도해 주세요.",
    );

  return evidence;
}

export type Evidence = z.infer<typeof evidenceSchema> & {
  sourceTitle: string;
  sourceUrl: string;
  sourceProvided?: true;
};

export type GroundedParagraph = { text: string; evidenceIds: string[] };

export function citedParagraph(
  paragraph: GroundedParagraph,
  evidence: ReadonlyMap<string, Evidence>,
  sourceNumbers: ReadonlyMap<string, number>,
): EditorNode {
  const content: EditorNode[] = [{ type: "text", text: paragraph.text }];
  const urls = new Set<string>();

  for (const id of paragraph.evidenceIds) {
    const source = evidence.get(id);
    if (source) urls.add(source.sourceUrl);
  }
  for (const url of urls)
    content.push(
      { type: "text", text: " " },
      {
        type: "text",
        text: `[${sourceNumbers.get(url)}]`,
        marks: [{ type: "link", attrs: { href: url } }],
      },
    );
  return { type: "paragraph", content };
}
