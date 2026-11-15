import { ManagementError } from "@cloudflare-ai-blog/database";
import { z } from "zod";
import type { Evidence } from "./draft-evidence";
import type { SourcePage } from "./research-sources";

const chunkSize = 900;
const embeddingBatchSize = 24;
const passagesPerSection = 4;
const embeddingResultSchema = z.object({
  data: z.array(z.array(z.number()).nonempty()),
});

type Section = { key: string; heading: string; readerQuestion: string };

function pagePassages(page: SourcePage) {
  const passages: Evidence[] = [];
  let heading = "";

  for (const raw of page.text.split(/\n+/u)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length <= 80 && !/[.!?。！？,，]$/u.test(line)) {
      if (heading.length + line.length < 140) {
        heading = [heading, line].filter(Boolean).join("\n");
        continue;
      }
    }

    let remaining = line;
    while (remaining) {
      let end = Math.min(chunkSize, remaining.length);
      if (end < remaining.length) {
        const wordBoundary = remaining.lastIndexOf(" ", end);
        if (wordBoundary > chunkSize / 2) end = wordBoundary;
      }
      const quote = [heading, remaining.slice(0, end).trim()]
        .filter(Boolean)
        .join("\n");
      passages.push({
        sourceId: page.id,
        sourceTitle: page.title,
        sourceUrl: page.url,
        sourceProvided: page.provided,
        quote,
        scope: null,
        announcedOn: null,
      });
      heading = "";
      remaining = remaining.slice(end).trimStart();
    }
  }

  if (heading) {
    passages.push({
      sourceId: page.id,
      sourceTitle: page.title,
      sourceUrl: page.url,
      sourceProvided: page.provided,
      quote: heading,
      scope: null,
      announcedOn: null,
    });
  }
  return passages;
}

async function embed(ai: AgentServiceEnv["AI"], texts: string[]) {
  const batches = Array.from(
    { length: Math.ceil(texts.length / embeddingBatchSize) },
    (_, index) =>
      texts.slice(index * embeddingBatchSize, (index + 1) * embeddingBatchSize),
  );
  try {
    const vectors = await Promise.all(
      batches.map(async (text) => {
        const result = await ai.run("@cf/baai/bge-m3", { text });
        const { data } = embeddingResultSchema.parse(result);
        if (data.length !== text.length)
          throw new Error("Incomplete embeddings");
        return data;
      }),
    );
    const all = vectors.flat();
    const dimension = all[0]?.length;
    return all.map((vector) => {
      const magnitude = Math.hypot(...vector);
      if (
        vector.length !== dimension ||
        !Number.isFinite(magnitude) ||
        !magnitude
      )
        throw new Error("Invalid embeddings");
      return vector.map((value) => value / magnitude);
    });
  } catch {
    throw new ManagementError(
      502,
      "소제목에 맞는 원문을 찾지 못했어요. 잠시 후 다시 생성해 주세요.",
    );
  }
}

export async function retrieveSectionEvidence(
  ai: AgentServiceEnv["AI"],
  pages: SourcePage[],
  sections: Section[],
  evidence: Map<string, Evidence>,
) {
  const passages = pages.flatMap(pagePassages);
  if (!passages.length)
    throw new ManagementError(422, "소제목을 뒷받침할 원문 문단이 없어요.");

  const vectors = await embed(ai, [
    ...sections.map(
      ({ heading, readerQuestion }) => `${heading}\n${readerQuestion}`,
    ),
    ...passages.map(({ sourceTitle, quote }) => `${sourceTitle}\n${quote}`),
  ]);
  const passageVectors = vectors.slice(sections.length);
  const byQuote = new Map(
    [...evidence].map(([id, { sourceId, quote }]) => [
      `${sourceId}: ${quote}`,
      id,
    ]),
  );

  return Object.fromEntries(
    sections.map(({ key }, sectionIndex) => {
      const query = vectors[sectionIndex];
      const ranked = passages.map((passage, index) => ({
        passage,
        score: passageVectors[index].reduce(
          (sum, value, i) => sum + value * query[i],
          0,
        ),
      }));
      ranked.sort((a, b) => b.score - a.score);
      const ids = new Set<string>();
      for (const { passage } of ranked) {
        const quoteKey = `${passage.sourceId}: ${passage.quote}`;
        let id = byQuote.get(quoteKey);
        if (!id) {
          id = `p${evidence.size + 1}`;
          evidence.set(id, passage);
          byQuote.set(quoteKey, id);
        }
        ids.add(id);
        if (ids.size === passagesPerSection) break;
      }
      return [key, [...ids]];
    }),
  );
}
