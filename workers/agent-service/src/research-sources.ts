import { ManagementError } from "@cloudflare-ai-blog/database";
import { fetchWeb, WebFetchError } from "agents/webfetch";
import type { AiDraftSubject, BlogSettings } from "@cloudflare-ai-blog/shared";
import { z } from "zod";

const sourceCandidatesSchema = z.array(
  z.object({ url: z.string(), title: z.string() }),
);
const searchResponseSchema = z.object({
  result: z.object({ results: sourceCandidatesSchema }),
});

export type SourcePage = {
  id: string;
  title: string;
  url: string;
  text: string;
  provided?: true;
  requestedUrls?: string[];
};

export function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      return;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return;
  }
}

export async function collectSources(
  { AI: ai, CERAMIC_API_KEY: searchKey }: AgentServiceEnv,
  keyword: string,
  language: string,
  referenceUrls: string[] = [],
): Promise<SourcePage[]> {
  if (!searchKey?.trim())
    throw new ManagementError(
      503,
      "Ceramic.ai 검색 키가 필요해요. Agent Worker에 CERAMIC_API_KEY를 설정해 주세요.",
    );

  const searchHint = /^ko(?:-|$)/i.test(language)
    ? "공식 자료"
    : "official source";

  let response: Response;
  try {
    response = await fetch("https://api.ceramic.ai/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${searchKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${keyword} ${searchHint}`,
        maxResults: 6,
        maxDescriptionLength: 1000,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ManagementError(
      503,
      "Ceramic.ai에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    await response.body?.cancel();
    console.warn("Ceramic.ai search failed", { status: response.status });
    if (response.status === 402)
      throw new ManagementError(
        503,
        "Ceramic.ai 웹 검색을 결제할 수 없어요. 계정의 무료 사용량과 결제 설정을 확인해 주세요.",
      );
    if (response.status === 401 || response.status === 403)
      throw new ManagementError(
        503,
        "Ceramic.ai 검색 키를 사용할 수 없어요. Agent Worker의 CERAMIC_API_KEY를 확인해 주세요.",
      );
    throw new ManagementError(
      503,
      "Ceramic.ai에서 공식 자료를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }

  const parsed = searchResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ManagementError(502, "Ceramic.ai 검색 결과를 읽지 못했어요.");

  return readSources(ai, parsed.data.result.results, referenceUrls);
}

export async function collectChatGptSources(
  ai: AgentServiceEnv["AI"],
  ticket: string,
  subject: AiDraftSubject,
  keyword: string,
  language: BlogSettings["language"],
  instructions: string,
  referenceUrls: string[] = [],
): Promise<SourcePage[]> {
  const unavailable = "로컬 관리자 서버의 ChatGPT 웹 검색에 연결하지 못했어요.";
  let response: Response;
  try {
    response = await fetch("http://127.0.0.1:3001/api/admin/chatgpt/research", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ticket}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, keyword, language, instructions }),
      redirect: "manual",
      signal: AbortSignal.timeout(75_000),
    });
  } catch {
    throw new ManagementError(503, unavailable);
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new ManagementError(502, unavailable);
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new ManagementError(
      response.status,
      error.data?.error ?? unavailable,
    );
  }
  const parsed = z
    .object({ sources: sourceCandidatesSchema })
    .safeParse(result);
  if (!parsed.success)
    throw new ManagementError(
      502,
      "ChatGPT 웹 검색의 출처 목록을 읽지 못했어요.",
    );
  return readSources(ai, parsed.data.sources, referenceUrls);
}

async function extractHtmlText(html: string) {
  // Strip boilerplate first so its text never reaches the extraction handlers.
  const cleaned = new HTMLRewriter()
    .on(
      "script, style, template, noscript, nav, footer, aside, [hidden], [aria-hidden='true']",
      {
        element(element) {
          element.remove();
        },
      },
    )
    .on("h1, h2, h3, h4, p, li, dt, dd, blockquote, tr, br", {
      element(element) {
        element.before("\n");
      },
    })
    .on("td, th", {
      element(element) {
        element.append(" | ");
      },
    })
    .on("td img[alt], th img[alt]", {
      element(element) {
        const label = element.getAttribute("alt")?.trim();
        if (label) element.before(` [${label.slice(0, 120)}] `);
      },
    })
    .transform(new Response(html));

  const body: string[] = [];
  const main: string[] = [];
  const extracted = new HTMLRewriter()
    .on("body", {
      text(chunk) {
        body.push(chunk.text);
      },
    })
    .on("main", {
      text(chunk) {
        main.push(chunk.text);
      },
    })
    .transform(cleaned);
  await extracted.text();

  const mainText = normalizeHtmlText(main);
  return mainText.length >= 500 ? mainText : normalizeHtmlText(body);
}

function normalizeHtmlText(chunks: string[]) {
  return chunks
    .join("")
    .replace(/[\t\r\f ]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n")
    .trim();
}

async function fetchSourcePage(url: string, ai: AgentServiceEnv["AI"]) {
  const options = {
    binding: ai,
    timeoutMs: 8_000,
    maxBytes: 1024 * 1024,
    maxRedirects: 3,
  };
  try {
    return await fetchWeb({ url, format: "raw" }, options);
  } catch (error) {
    if (
      !(error instanceof WebFetchError) ||
      error.code !== "web_fetch_unsupported_content_type"
    )
      throw error;
    return fetchWeb({ url }, options);
  }
}

export function collectReferenceSources(
  ai: AgentServiceEnv["AI"],
  urls: string[],
) {
  return readSources(ai, [], urls);
}

async function readSources(
  ai: AgentServiceEnv["AI"],
  results: z.infer<typeof sourceCandidatesSchema>,
  referenceUrls: string[],
) {
  const candidates = new Map<string, { title: string; provided?: true }>();
  for (const value of referenceUrls) {
    const url = sourceUrl(value);
    if (!url) throw new ManagementError(400, "참고 URL 형식을 확인해 주세요.");
    candidates.set(url, { title: new URL(url).hostname, provided: true });
  }

  const searchLimit = Math.min(candidates.size + 6, 8);
  for (const item of results) {
    if (candidates.size >= searchLimit) break;
    const url = sourceUrl(item.url);
    if (url && !candidates.has(url)) candidates.set(url, { title: item.title });
  }

  const entries = [...candidates];
  // The SDK checks redirect destinations and caps reads before conversion.
  const pages = await Promise.allSettled(
    entries.map(async ([url, { title, provided }]) => {
      const page = await fetchSourcePage(url, ai);
      const finalUrl = sourceUrl(page.finalUrl);
      if (!finalUrl || page.status < 200 || page.status >= 300) return null;
      const content =
        page.contentType === "text/html" ||
        page.contentType === "application/xhtml+xml"
          ? await extractHtmlText(page.content)
          : page.content;
      const text = content.trim().slice(0, 12_000);
      if (!text) return null;
      return {
        title: (page.title?.trim() || title.trim()).slice(0, 250),
        url: finalUrl,
        text,
        provided,
        requestedUrl: url,
      };
    }),
  );

  const unread = pages.flatMap((result, index) => {
    const [url, { provided }] = entries[index];
    return provided && (result.status === "rejected" || !result.value)
      ? [new URL(url).hostname]
      : [];
  });
  if (unread.length)
    throw new ManagementError(
      422,
      `다음 사이트의 참고 원문을 읽지 못했어요. 공개 페이지 주소를 확인하거나 해당 링크를 삭제해 주세요. (${unread.join(", ")})`,
    );

  const sources = new Map<string, SourcePage>();
  for (const result of pages) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { requestedUrl, ...page } = result.value;
    const existing = sources.get(page.url);
    if (existing) existing.requestedUrls?.push(requestedUrl);
    else
      sources.set(page.url, {
        ...page,
        id: `source_${sources.size + 1}`,
        requestedUrls: [requestedUrl],
      });
  }
  if (!sources.size)
    throw new ManagementError(
      422,
      "검색 결과는 받았지만 원문을 읽지 못했어요. 다른 공식 출처를 찾을 수 있도록 검색어를 조정해 주세요.",
    );

  return [...sources.values()];
}
