import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@cloudflare-ai-blog/database") {
      const url = new URL(
        "../../../packages/database/src/management.ts",
        import.meta.url,
      );
      return { url: url.href, shortCircuit: true };
    }
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/agent-service/src/") &&
      !specifier.endsWith(".md")
    )
      return next(specifier + ".ts", context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/editorial-guide.md")) {
      const guide = readFileSync(new URL(url), "utf8");
      return {
        format: "module",
        source: "export default " + JSON.stringify(guide),
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const { generateDraft, suggestDraftSubject } =
  await import("../src/generate-draft.ts");
const { reviewPost } = await import("../src/review-post.ts");
const { suggestPostSeo } = await import("../src/suggest-post-seo.ts");
const { prepareDraft } = await import("../src/prepare-draft.ts");
const { generatePostImages } = await import("../src/generate-cover.ts");

test("AI plans distinct section images alongside the cover and rejects non-JPEG output", async () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9);
  const sections = [
    {
      headingIndex: 0,
      heading: "배터리",
      body: "충전 시간과 사용 시간을 알아봅니다.",
    },
    {
      headingIndex: 2,
      heading: "스위치",
      body: "타건감은 스위치 구성에 따라 달라집니다.",
    },
  ];
  const post = {
    title: "키보드 구매 안내",
    seoDescription: "구매 전 확인 사항",
    content: {
      type: "doc",
      content: sections.flatMap(({ heading, body }) => [
        { type: "heading", content: [{ type: "text", text: heading }] },
        { type: "paragraph", content: [{ type: "text", text: body }] },
      ]),
    },
  };
  const brief = {
    cover: { prompt: "Compact keyboard on a desk", alt: "책상 위의 키보드" },
    inline: [
      {
        headingIndex: 0,
        prompt: "Keyboard connected to a charger",
        alt: "충전 케이블을 연결한 키보드",
      },
      {
        headingIndex: 2,
        prompt: "Cross-section of a switch",
        alt: "키보드 스위치 단면",
      },
    ],
  };
  let image = Buffer.from(jpeg).toString("base64");
  let planCalls = 0;
  const prompts = [];
  const env = {
    AI: {
      async run(model, input) {
        if (model === "@cf/black-forest-labs/flux-1-schnell") {
          prompts.push(input.prompt);
          return { image };
        }
        assert.equal(input.response_format.json_schema.name, "cover_brief");
        const context = JSON.parse(input.messages[1].content);
        assert.equal(context.title, post.title);
        assert.equal(context.summary, post.seoDescription);
        assert.deepEqual(context.sections, sections);
        planCalls++;
        const plan =
          planCalls === 1
            ? { ...brief, inline: [brief.inline[0], brief.inline[0]] }
            : brief;
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(plan) },
            },
          ],
        };
      },
    },
  };
  assert.deepEqual(await generatePostImages(env, post), {
    cover: { bytes: jpeg, alt: brief.cover.alt },
    inline: brief.inline.map(({ headingIndex, alt }) => ({
      bytes: jpeg,
      headingIndex,
      alt,
    })),
  });
  assert.equal(planCalls, 2);
  assert.deepEqual(
    prompts.sort(),
    [brief.cover, ...brief.inline].map(({ prompt }) => prompt).sort(),
  );
  image = Buffer.from("not an image").toString("base64");
  await assert.rejects(() => generatePostImages(env, post), { status: 502 });
});

test("SEO uses saved post text and retries an out-of-range title", async () => {
  const suggestion = {
    seoTitle: "Rainy75 모델별 배터리 차이",
    seoDescription:
      "Rainy75 Standard와 Pro를 비교할 때 배터리 표기를 확인하는 법을 알아보세요.",
  };
  let calls = 0;
  const env = {
    AI: {
      async run(_model, request) {
        assert.equal(request.response_format.json_schema.name, "post_seo");
        const input = JSON.parse(request.messages[1].content);
        assert.equal(input.title, "Rainy75 구매 안내");
        assert.equal(
          input.body,
          "Standard와 Pro의 배터리 차이를 확인하는 글입니다.",
        );
        calls++;
        const output =
          calls === 1
            ? { ...suggestion, seoTitle: "가".repeat(101) }
            : suggestion;
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(output) },
            },
          ],
        };
      },
    },
  };
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Standard와 Pro의 배터리 차이를 확인하는 글입니다. ",
          },
          {
            type: "text",
            text: "[1]",
            marks: [
              {
                type: "link",
                attrs: { href: "https://manufacturer.example/product" },
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    await suggestPostSeo(env, { title: "Rainy75 구매 안내", content }),
    suggestion,
  );
  assert.equal(calls, 2);
});

test("pre-publication QA checks saved text against its citation and returns actionable issues", async (t) => {
  const originalUrl = "https://manufacturer.example/product";
  const finalUrl = "https://manufacturer.example/current-product";
  t.mock.method(globalThis, "fetch", async (request) => {
    const url =
      typeof request === "string" ? request : (request.url ?? request.href);
    if (url === originalUrl) return Response.redirect(finalUrl);
    assert.equal(url, finalUrl);
    return new Response("한국용 모델의 배터리 용량은 3,500mAh입니다.", {
      headers: { "Content-Type": "text/plain" },
    });
  });
  const text = "한국용 모델은 7,000mAh 배터리를 탑재합니다.";
  const reason = "원문에 기재된 한국용 모델의 용량은 3,500mAh예요.";
  const env = {
    AI: {
      async run(_model, request) {
        assert.equal(request.response_format.json_schema.name, "post_qa");
        const { blocks, pages } = JSON.parse(request.messages[1].content);
        assert.equal(pages[0].url, finalUrl);
        assert.deepEqual(blocks.block_2.sourceIds, [pages[0].id]);
        const verdicts = { block_1: "pass", block_2: reason };
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(verdicts) },
            },
          ],
        };
      },
    },
  };
  const issues = await reviewPost(env, {
    title: "모델별 배터리 사양",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: text + " " },
            {
              type: "text",
              text: "[1]",
              marks: [{ type: "link", attrs: { href: originalUrl } }],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(issues, [
    { excerpt: text + " [1]", reason, sources: [originalUrl] },
  ]);
});

const settings = {
  name: "테스트 블로그",
  description: "",
  language: "ko",
  topic: "생활 정보",
  audience: "",
  tone: "",
  rules: "",
  avoid: "",
};
const film = {
  keyword: "어벤져스: 둠스데이",
  urls: ["https://movies.disney.com/film", "https://disney.example.kr/film"],
  quotes: [
    "미국 극장 개봉 예정일은 2026년 12월 18일입니다.",
    "대한민국 극장 개봉 예정일은 2026년 12월 16일입니다.",
  ],
  scopes: ["미국", "대한민국"],
};
const keyboard = {
  keyword: "Rainy75",
  urls: [
    "https://manufacturer.example/rainy75-standard",
    "https://manufacturer.example/rainy75-pro",
  ],
  quotes: [
    "Rainy75 Standard 버전의 배터리 용량은 3,500mAh입니다.",
    "Rainy75 Pro 버전의 배터리 용량은 7,000mAh입니다.",
  ],
  scopes: ["Rainy75 Standard", "Rainy75 Pro"],
};

function scenario(
  t,
  fixture,
  {
    searchStatus = 200,
    useChatGpt = false,
    noSearchSources = false,
    searchKey = "ceramic-test-key",
    readStatus = 200,
    noEvidence = false,
    fakeCitation = false,
    incompleteCheck = false,
    bodyFormat,
    castPassage = false,
    thinCast = false,
    partialCoverage = false,
    rejectExpansion = false,
    repeatIntroduction = false,
    neverAnswer = false,
    referenceUrls,
    instructions = "",
    useSourceSearch = true,
    verdict = "supported",
  } = {},
) {
  const { keyword, urls, quotes, scopes } = fixture;
  const subject = {
    name: keyword,
    type: fixture === film ? "film" : "product",
  };
  const castNames = "Cast\nAlex Rivera, Sam Taylor, Jordan Park, Casey Brooks";
  const sourceTexts = castPassage
    ? [quotes[0], quotes[1] + "\n" + castNames]
    : quotes;
  const sharedSentence =
    "제조사가 공개한 제품 안내에는 버전별 배터리 사양이 따로 기재돼 있어요.";
  const sectionOneText = repeatIntroduction
    ? quotes[0] + " " + sharedSentence
    : quotes[0];
  let draftAttempts = 0;
  let coverageChecks = 0;
  const stages = [];
  const searches = [];
  const chatGptTicket = "a".repeat(43);
  const fetch = t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = typeof input === "string" ? input : (input.url ?? input.href);
    if (url === "http://127.0.0.1:3001/api/admin/chatgpt/research") {
      assert.equal(useChatGpt, true);
      assert.equal(options.redirect, "manual");
      searches.push("ChatGPT");
      assert.equal(
        new Headers(options.headers).get("Authorization"),
        "Bearer " + chatGptTicket,
      );
      assert.deepEqual(JSON.parse(options.body), {
        subject,
        keyword,
        language: "ko",
        instructions,
      });
      if (searchStatus !== 200)
        return Response.json(
          { error: "ChatGPT search unavailable" },
          { status: searchStatus },
        );
      return Response.json({
        sources: noSearchSources
          ? []
          : urls.map((url) => ({ url, title: "공식 안내" })),
      });
    }
    if (url === "http://127.0.0.1:3001/api/admin/chatgpt/body") {
      assert.equal(useChatGpt, true);
      assert.equal(options.redirect, "manual");
      assert.equal(
        new Headers(options.headers).get("Authorization"),
        "Bearer " + chatGptTicket,
      );
      const { input, schema, instructions } = JSON.parse(options.body);
      const { choices } = await env.AI.run("test", {
        messages: [{ content: instructions }, { content: input }],
        response_format: { json_schema: { name: "article_draft", schema } },
      });
      return Response.json({ text: choices[0].message.content });
    }
    if (url === "https://api.ceramic.ai/search") {
      assert.equal(useChatGpt, false);
      searches.push(url);
      assert.equal(options.method, "POST");
      assert.equal(
        new Headers(options.headers).get("Authorization"),
        "Bearer ceramic-test-key",
      );
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body), {
        query: keyword + " 공식 자료",
        maxResults: 6,
        maxDescriptionLength: 1000,
      });
      return Response.json(
        {
          requestId: "test",
          result: {
            results: [
              ...urls.map((url) => ({
                url,
                title: "공식 안내",
                description: "검색 결과에만 있는 근거 없는 설명입니다.",
              })),
              { url: urls[0] + "#section", title: "중복" },
              { url: "https://127.0.0.1/admin", title: "외부 출처가 아님" },
            ],
          },
        },
        { status: searchStatus },
      );
    }
    const index = urls.indexOf(url);
    assert.notEqual(index, -1);
    assert.equal(new Headers(options?.headers).has("Authorization"), false);
    return new Response(sourceTexts[index], {
      status: readStatus,
      headers: { "Content-Type": "text/plain" },
    });
  });
  const env = {
    AI_DRAFT_SOURCE_CHECK: String(useSourceSearch),
    CERAMIC_API_KEY: searchKey,
    AI: {
      async run(model, request) {
        if (model === "@cf/baai/bge-m3") {
          return {
            data: request.text.map((text) =>
              /출연진|Cast/u.test(text) ? [0, 1] : [1, 0],
            ),
          };
        }
        const { name, schema } = request.response_format.json_schema;
        const input = JSON.parse(request.messages[1].content);
        stages.push(name);
        assert.ok(input.confirmedSubject);
        let response;
        let responseText;
        switch (name) {
          case "article_plan":
            assert.equal(input.pages.length, 2);
            assert.equal(input.pages[0].text, quotes[0]);
            if (referenceUrls?.length) {
              assert.equal(input.pages[0].provided, true);
              assert.equal(input.pages[1].provided, undefined);
            }
            assert.equal(input.pages[1].text, sourceTexts[1]);
            assert.doesNotMatch(JSON.stringify(input.pages), /검색 결과에만/);
            response = {
              searchIntent: "공식 정보 확인",
              outline: scopes.map((scope) => ({
                heading: scope + " 안내",
                readerQuestion: scope + "에 대해 무엇을 확인할 수 있나요?",
                answerBrief: quotes[scopes.indexOf(scope)],
              })),
              evidence: quotes.map((quote, index) => ({
                sourceId: "source_" + (index + 1),
                quote: noEvidence
                  ? "검색 결과에만 있는 근거 없는 설명입니다."
                  : quote,
                scope: scopes[index],
                announcedOn: "2025년 5월 2일",
              })),
            };
            if (castPassage)
              response.outline[1] = {
                heading: "공식 발표에 나온 출연진",
                readerQuestion: partialCoverage
                  ? "공식 발표의 출연진은 누구이며 전체 명단은 어떻게 되나요?"
                  : "공식 발표의 출연진은 누구인가요?",
                answerBrief: "공식 자료에서 출연진을 확인하세요.",
              };
            break;
          case "article_draft": {
            draftAttempts++;
            const castId = input.sectionEvidence.section_2[0];
            if (castPassage)
              assert.equal(input.evidence[castId].quote, castNames);
            if (referenceUrls?.length) {
              assert.equal(input.evidence.e1.sourceProvided, true);
              assert.equal(input.evidence.e2.sourceProvided, undefined);
            }
            assert.deepEqual(
              Object.entries(input.evidence)
                .filter(([id]) => id.startsWith("e"))
                .map(([, { scope }]) => scope),
              scopes,
            );
            assert.ok(
              Object.values(input.evidence).every(
                ({ announcedOn }) => announcedOn === null,
              ),
            );
            response = {
              title: keyword + " 공식 정보",
              introduction: {
                text: repeatIntroduction
                  ? sharedSentence
                  : keyword + "의 공식 안내를 확인해 보세요.",
                evidenceIds: ["e1"],
              },
              sections: {
                section_2: [
                  castPassage
                    ? {
                        text: thinCast
                          ? "공식 출연진에는 Alex Rivera와 Sam Taylor가 포함돼요."
                          : draftAttempts === 1 || neverAnswer
                            ? "제공된 원문에서 출연진을 확인하기 어려워요."
                            : "공식 출연진에는 Alex Rivera, Sam Taylor, Jordan Park가 포함돼요.",
                        evidenceIds: [castId],
                      }
                    : {
                        text: quotes[1],
                        evidenceIds: [fakeCitation ? "e99" : "e2"],
                      },
                ],
                section_1: [
                  {
                    text: sectionOneText,
                    evidenceIds: [verdict === "unsupported" ? "e2" : "e1"],
                  },
                ],
              },
            };
            if (castPassage && draftAttempts > 1)
              assert.match(input.editorialFeedback, /출연진은 누구/);
            if (bodyFormat === "fenced")
              responseText =
                "\x60\x60\x60json\n" +
                JSON.stringify(response) +
                "\n\x60\x60\x60";
            if (bodyFormat === "invalid" && draftAttempts === 1)
              responseText = '{"title":';
            if (bodyFormat === "invalid" && draftAttempts === 2)
              assert.match(input.editorialFeedback, /one complete JSON object/);
            if (thinCast && draftAttempts > 1) {
              assert.match(
                input.editorialFeedback,
                /distinct, directly supported details/,
              );
              response.sections.section_2.push({
                text: "공식 명단에는 Jordan Park와 Casey Brooks도 이름을 올렸어요.",
                evidenceIds: [castId],
              });
            }
            break;
          }
          case "article_fact_check":
            coverageChecks++;
            assert.equal(input.pages.length, 2);
            assert.equal(
              input.blocks.section_1_paragraph_1.text,
              sectionOneText,
            );
            if (repeatIntroduction)
              assert.equal(input.blocks.introduction, undefined);
            assert.deepEqual(
              schema.properties.claims.required,
              Object.keys(input.blocks),
            );
            assert.equal(schema.additionalProperties, false);
            response = {
              claims: Object.fromEntries(
                Object.keys(input.blocks).map((key) => [key, "supported"]),
              ),
              sections: Object.fromEntries(
                input.sections.map(({ key }) => [key, "answered"]),
              ),
            };
            if (castPassage && (coverageChecks === 1 || neverAnswer))
              response.sections.section_2 = thinCast
                ? "needs_detail"
                : "missing_answer";
            if (partialCoverage) response.sections.section_2 = "partial_answer";
            response.claims.section_1_paragraph_1 = verdict;
            if (rejectExpansion && coverageChecks === 2)
              response.claims.section_2_paragraph_2 = "unsupported";
            if (
              incompleteCheck === true ||
              (incompleteCheck === "once" && coverageChecks === 1)
            )
              delete response.claims.title;
            if (incompleteCheck && coverageChecks === 2)
              assert.match(request.messages[0].content, /every required key/);
            break;
          default:
            assert.fail("Unexpected model stage");
        }
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: responseText ?? JSON.stringify(response) },
            },
          ],
        };
      },
    },
  };
  const result = generateDraft(
    env,
    {
      requestId: crypto.randomUUID(),
      keyword,
      subject,
      categoryId: null,
      instructions,
      referenceUrls,
      ...(useChatGpt ? { chatGptTicket } : {}),
    },
    settings,
    null,
  );
  return { result, stages, fetch, searches };
}

for (const fixture of [film, keyboard]) {
  test(`${fixture.keyword} links original sources in the same order as the body`, async (t) => {
    const { result, stages, fetch } = scenario(t, fixture);
    const draft = await result;
    assert.deepEqual(stages, [
      "article_plan",
      "article_draft",
      "article_fact_check",
    ]);
    assert.equal(fetch.mock.callCount(), 3);
    const links = draft.content.content.flatMap((block) =>
      block.content.flatMap(
        (node) => node.marks?.map((mark) => mark.attrs.href) ?? [],
      ),
    );
    assert.deepEqual(links, [fixture.urls[0], ...fixture.urls]);
  });

  test(`${fixture.keyword} rejects claims sourced from another country or variant`, async (t) => {
    const { result, stages } = scenario(t, fixture, { verdict: "unsupported" });
    await assert.rejects(result, { status: 422 });
    assert.equal(stages.at(-1), "article_fact_check");
  });
}

test("ChatGPT draft passes original pages to planning and retains their links", async (t) => {
  const { result, stages, searches } = scenario(t, film, { useChatGpt: true });
  const draft = await result;
  assert.deepEqual(searches, ["ChatGPT"]);
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_fact_check",
  ]);
  const links = draft.content.content.flatMap((block) =>
    block.content.flatMap(
      (node) => node.marks?.map((mark) => mark.attrs.href) ?? [],
    ),
  );
  assert.deepEqual(links, [film.urls[0], ...film.urls]);
});

test("administrator references and unique search results reach the same draft", async (t) => {
  const { result, searches, fetch } = scenario(t, keyboard, {
    useChatGpt: true,
    referenceUrls: [keyboard.urls[0], keyboard.urls[0] + "#details"],
    instructions: "두 버전의 차이를 확인해 주세요.",
  });
  const draft = await result;
  const links = draft.content.content.flatMap((block) =>
    block.content.flatMap(
      (node) => node.marks?.map((mark) => mark.attrs.href) ?? [],
    ),
  );
  assert.deepEqual(searches, ["ChatGPT"]);
  assert.equal(fetch.mock.callCount(), 4); // Search, two distinct page reads, and one GPT draft.
  assert.deepEqual(links, [keyboard.urls[0], ...keyboard.urls]);
});

test("an unreadable administrator reference returns an error before drafting", async (t) => {
  const { result, stages, searches } = scenario(t, keyboard, {
    referenceUrls: keyboard.urls,
    useSourceSearch: false,
    readStatus: 404,
  });
  await assert.rejects(result, {
    status: 422,
    message: /참고 원문을 읽지 못했어요/,
  });
  assert.deepEqual(stages, []);
  assert.deepEqual(searches, []);
});

test("a section receives original cast text omitted by planning and is retried when it misses the answer", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    castPassage: true,
  });
  const draft = await result;
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_fact_check",
    "article_draft",
    "article_fact_check",
  ]);
  const cast = draft.content.content.at(-1);
  assert.match(cast.content[0].text, /Alex Rivera, Sam Taylor, Jordan Park/);
  assert.equal(cast.content.at(-1).marks[0].attrs.href, film.urls[1]);
});

test("QA requests a second paragraph when the source supports more useful detail", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    castPassage: true,
    thinCast: true,
  });
  const draft = await result;
  assert.equal(stages.filter((stage) => stage === "article_draft").length, 2);
  const [first, second] = draft.content.content.slice(-2);
  assert.match(first.content[0].text, /Alex Rivera/);
  assert.match(second.content[0].text, /Casey Brooks/);
  assert.equal(second.content.at(-1).marks[0].attrs.href, film.urls[1]);
});

test("grounded drafting removes a repeated introduction while preserving the cited answer", async (t) => {
  const { result, stages } = scenario(t, keyboard, {
    useChatGpt: true,
    repeatIntroduction: true,
  });
  const draft = await result;
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_fact_check",
  ]);
  assert.equal(draft.content.content[0].type, "heading");
  const answer = draft.content.content[1];
  assert.match(answer.content[0].text, /버전별 배터리 사양/);
  assert.equal(answer.content.at(-1).marks[0].attrs.href, keyboard.urls[0]);
});

test("an unverified expansion cannot replace an already verified draft", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    castPassage: true,
    thinCast: true,
    rejectExpansion: true,
  });
  const draft = await result;
  assert.equal(
    stages.filter((stage) => stage === "article_fact_check").length,
    2,
  );
  const cast = draft.content.content.at(-1);
  assert.match(cast.content[0].text, /Alex Rivera/);
  assert.doesNotMatch(JSON.stringify(draft.content), /Casey Brooks/);
});

test("a factual partial answer survives one attempted expansion", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    castPassage: true,
    thinCast: true,
    partialCoverage: true,
    rejectExpansion: true,
  });
  const draft = await result;
  assert.equal(stages.filter((stage) => stage === "article_draft").length, 2);
  assert.match(draft.content.content.at(-1).content[0].text, /Alex Rivera/);
  assert.doesNotMatch(JSON.stringify(draft.content), /Casey Brooks/);
});

test("an unanswered section is named when the rewrite cannot supply its answer", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    castPassage: true,
    neverAnswer: true,
  });
  await assert.rejects(result, {
    status: 502,
    message: /원문을 읽고 다시 작성했지만.+공식 발표에 나온 출연진/,
  });
  assert.equal(stages.filter((stage) => stage === "article_draft").length, 2);
});

test("ChatGPT search failure or missing sources stops before planning", async (t) => {
  await t.test("unsupported search", async (t) => {
    const { result, stages, searches } = scenario(t, film, {
      useChatGpt: true,
      searchStatus: 400,
    });
    await assert.rejects(result, {
      status: 400,
      message: "ChatGPT search unavailable",
    });
    assert.deepEqual(searches, ["ChatGPT"]);
    assert.deepEqual(stages, []);
  });
  await t.test("unexpected redirect", async (t) => {
    const { result, stages } = scenario(t, film, {
      useChatGpt: true,
      searchStatus: 307,
    });
    await assert.rejects(result, { status: 502 });
    assert.deepEqual(stages, []);
  });
  await t.test("missing sources", async (t) => {
    const { result, stages, fetch } = scenario(t, film, {
      useChatGpt: true,
      noSearchSources: true,
    });
    await assert.rejects(result, { status: 422 });
    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(stages, []);
  });
});

test("search failures and unreadable pages never reach the model", async (t) => {
  await t.test("search unavailable", async (t) => {
    const { result, stages } = scenario(t, film, { searchStatus: 503 });
    await assert.rejects(result, { status: 503 });
    assert.deepEqual(stages, []);
  });
  await t.test(
    "rejected Ceramic.ai key stops before reading any source",
    async (t) => {
      const { result, stages, searches } = scenario(t, film, {
        searchStatus: 401,
      });
      await assert.rejects(result, {
        status: 503,
        message: /Ceramic\.ai 검색 키/,
      });
      assert.equal(searches.length, 1);
      assert.deepEqual(stages, []);
    },
  );
  await t.test("provider payment is required", async (t) => {
    const { result, stages, searches } = scenario(t, film, {
      searchStatus: 402,
    });
    await assert.rejects(result, {
      status: 503,
      message: /무료 사용량과 결제 설정/,
    });
    assert.equal(searches.length, 1);
    assert.deepEqual(stages, []);
  });
  await t.test(
    "missing search key stops before any network call",
    async (t) => {
      const { result, stages, fetch } = scenario(t, film, { searchKey: "" });
      await assert.rejects(result, { status: 503, message: /CERAMIC_API_KEY/ });
      assert.equal(fetch.mock.callCount(), 0);
      assert.deepEqual(stages, []);
    },
  );
  await t.test("source cannot be read", async (t) => {
    const { result, stages } = scenario(t, film, { readStatus: 403 });
    await assert.rejects(result, { status: 422 });
    assert.deepEqual(stages, []);
  });
});

test("an invented quote is never passed to the writing model", async (t) => {
  const { result, stages } = scenario(t, film, { noEvidence: true });
  await assert.rejects(result, { status: 422 });
  assert.deepEqual(stages, ["article_plan"]);
});

test("a made-up citation does not reach QA", async (t) => {
  const { result, stages } = scenario(t, film, { fakeCitation: true });
  await assert.rejects(result, { status: 502 });
  assert.deepEqual(stages, ["article_plan", "article_draft", "article_draft"]);
});

test("unresolved conflicts or omitted QA blocks prevent saving", async (t) => {
  await t.test("conflict", async (t) => {
    const { result } = scenario(t, film, { verdict: "conflict" });
    await assert.rejects(result, { status: 422 });
  });
  await t.test("incomplete verdict", async (t) => {
    const { result, stages } = scenario(t, keyboard, { incompleteCheck: true });
    await assert.rejects(result, { status: 502, message: /사실 검증 단계/ });
    assert.equal(
      stages.filter((stage) => stage === "article_fact_check").length,
      2,
    );
  });
});

test("a malformed GPT body gets one format retry and still passes fact checking", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    bodyFormat: "invalid",
  });
  const draft = await result;
  assert.ok(draft.title);
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_draft",
    "article_fact_check",
  ]);
});

test("a complete fenced GPT response is validated without another body request", async (t) => {
  const { result, stages } = scenario(t, film, {
    useChatGpt: true,
    bodyFormat: "fenced",
  });
  const draft = await result;
  assert.ok(draft.title);
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_fact_check",
  ]);
});

test("a missing QA verdict is retried without rewriting the body", async (t) => {
  const { result, stages } = scenario(t, keyboard, { incompleteCheck: "once" });
  const draft = await result;
  assert.ok(draft.title);
  assert.deepEqual(stages, [
    "article_plan",
    "article_draft",
    "article_fact_check",
    "article_fact_check",
  ]);
});

test("default draft prepares the article and SEO together without a web request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () =>
    assert.fail("Unexpected web request"),
  );
  const seo = {
    seoTitle: "기계식 키보드 첫 구매 가이드",
    seoDescription:
      "키 배열과 타건 소리를 비교해 처음 쓸 기계식 키보드를 고르는 방법을 알아보세요.",
  };
  const stages = [];
  const env = {
    AI: {
      async run(_model, request) {
        const { name, schema } = request.response_format.json_schema;
        const input = JSON.parse(request.messages[1].content);
        stages.push(name);
        if (name === "post_seo") {
          assert.equal(input.title, "첫 기계식 키보드를 고르는 기준");
          assert.match(input.body, /숫자 입력이 잦다면 별도의 숫자 키패드/);
          return {
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(seo) },
              },
            ],
          };
        }
        assert.ok(input.confirmedSubject);
        assert.equal(input.keyword, "기계식 키보드 고르는 법");
        assert.equal(input.additionalInstructions, "처음 구매하는 독자 대상");
        assert.equal(Object.hasOwn(input, "pages"), false);
        assert.equal(Object.hasOwn(input, "evidence"), false);
        assert.match(
          request.messages[0].content,
          /Omit exact dates, current prices or availability/,
        );
        assert.match(request.messages[0].content, /Never invent citations/);
        let response;
        if (name === "article_plan") {
          assert.equal(Object.hasOwn(schema.properties, "evidence"), false);
          response = {
            searchIntent: "첫 키보드를 고르는 기준",
            outline: [
              {
                heading: "배열과 책상 공간",
                readerQuestion: "어떤 배열을 고를까요?",
                answerBrief:
                  "숫자 입력이 잦다면 숫자 키패드가 있는 배열을 고려하세요.",
              },
              {
                heading: "소음과 사용 환경",
                readerQuestion: "집과 사무실에서 무엇이 달라지나요?",
                answerBrief:
                  "공유 공간에서 쓸 때는 직접 타건 소리를 비교하세요.",
              },
            ],
          };
        } else {
          assert.equal(name, "article_draft");
          assert.equal(
            schema.properties.introduction.properties.evidenceIds.maxItems,
            0,
          );
          response = {
            title: "첫 기계식 키보드를 고르는 기준",
            introduction: {
              text: "처음 구매한다면 키보드를 놓을 자리와 업무에 필요한 키를 먼저 확인하세요.",
              evidenceIds: [],
            },
            sections: {
              section_1: [
                {
                  text: "처음 구매한다면 키보드를 놓을 자리와 업무에 필요한 키를 먼저 확인하세요. 숫자 입력이 잦다면 별도의 숫자 키패드가 필요한지 생각해 보세요.",
                  evidenceIds: [],
                },
              ],
              section_2: [
                {
                  text: "공유 공간에서 쓴다면 직접 타건 소리를 들어보고 선택하세요.",
                  evidenceIds: [],
                },
              ],
            },
          };
        }
        return {
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(response) },
            },
          ],
        };
      },
    },
  };
  const draft = await prepareDraft(
    env,
    {
      requestId: crypto.randomUUID(),
      keyword: "기계식 키보드 고르는 법",
      subject: { name: "기계식 키보드 고르기", type: "general" },
      categoryId: null,
      instructions: "처음 구매하는 독자 대상",
    },
    settings,
    null,
  );
  assert.deepEqual(stages, ["article_plan", "article_draft", "post_seo"]);
  assert.equal(draft.seoTitle, seo.seoTitle);
  assert.equal(draft.seoDescription, seo.seoDescription);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(draft.title, "첫 기계식 키보드를 고르는 기준");
  assert.equal(draft.content.content.length, 5);
  assert.equal(
    draft.content.content[2].content[0].text,
    "숫자 입력이 잦다면 별도의 숫자 키패드가 필요한지 생각해 보세요.",
  );
  assert.ok(
    draft.content.content.every((block) =>
      block.content.every((node) => !node.marks),
    ),
  );
});

test("drafts must answer the outline before reaching storage", async (t) => {
  const outline = [
    {
      heading: "키보드 배열과 책상 공간",
      readerQuestion: "어떤 배열을 고를까요?",
      answerBrief: "숫자 입력이 잦다면 숫자 키패드가 있는 배열을 고려하세요.",
    },
    {
      heading: "사무실에서 키보드 소음 확인하기",
      readerQuestion: "소음이 신경 쓰이면 어떻게 비교하나요?",
      answerBrief:
        "실제 사용하는 책상에서 타건 소리를 비교하고 주변으로 얼마나 들리는지 확인하세요.",
    },
  ];
  const paragraph = (text) => ({ text, evidenceIds: [] });
  const cases = [
    {
      name: "copied heading is rewritten with a useful answer",
      badText: outline[0].heading + "?",
      retry: true,
      feedback: /repeats an outline heading or question/,
    },
    {
      name: "copied reader question still fails after a rewrite",
      badText: outline[0].readerQuestion,
      retry: false,
      feedback: /repeats an outline heading or question/,
    },
    {
      name: "placeholder text cannot count as a section",
      badText: "자세한 내용은 확인이 필요합니다.",
      retry: false,
      feedback: /too little body text/,
    },
  ];
  for (const { name, badText, retry, feedback } of cases) {
    await t.test(name, async () => {
      let writes = 0;
      const env = {
        AI: {
          async run(_model, request) {
            const { name } = request.response_format.json_schema;
            const input = JSON.parse(request.messages[1].content);
            let response;
            if (name === "article_plan") {
              response = { searchIntent: "키보드 구매 기준", outline };
            } else {
              assert.equal(name, "article_draft");
              writes += 1;
              assert.equal(
                input.plan.outline[0].answerBrief,
                outline[0].answerBrief,
              );
              if (writes === 2) assert.match(input.editorialFeedback, feedback);
              response = {
                title: "첫 기계식 키보드를 고르는 법",
                introduction: paragraph(
                  "키보드를 놓을 자리와 자주 쓰는 키를 먼저 확인하세요.",
                ),
                sections: {
                  section_1: [
                    paragraph(
                      writes === 2 && retry
                        ? "숫자 키패드를 자주 쓰지 않는다면 텐키리스 배열로 책상에서 마우스를 움직일 공간을 넓힐 수 있어요."
                        : badText,
                    ),
                  ],
                  section_2: [paragraph(outline[1].answerBrief)],
                },
              };
            }
            return {
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify(response) },
                },
              ],
            };
          },
        },
      };
      const result = generateDraft(
        env,
        {
          requestId: crypto.randomUUID(),
          keyword: "기계식 키보드",
          subject: { name: "기계식 키보드", type: "product" },
          categoryId: null,
          instructions: "",
        },
        settings,
        null,
      );
      if (retry) {
        const draft = await result;
        assert.match(
          draft.content.content[2].content[0].text,
          /마우스를 움직일 공간/,
        );
      } else {
        await assert.rejects(result, {
          status: 502,
          message: /본문을 완성하지 못했어요/,
        });
      }
      assert.equal(writes, 2);
    });
  }
});

test("subject identification returns a reviewable suggestion without writing an outline", async () => {
  const inputs = [
    {
      keyword: "마블 어벤져스 둠스데이",
      instructions: "",
      suggested: { name: "어벤져스 둠스데이", type: "game" },
    },
    {
      keyword: "아웃랜더스",
      instructions: "",
      suggested: { name: "아웃랜더스", type: null },
    },
  ];
  for (const { keyword, instructions, suggested } of inputs) {
    let calls = 0;
    const env = {
      AI: {
        async run(_model, request) {
          calls += 1;
          assert.equal(
            request.response_format.json_schema.name,
            "article_subject",
          );
          assert.deepEqual(JSON.parse(request.messages[1].content), {
            keyword,
            instructions,
          });
          return {
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(suggested) },
              },
            ],
          };
        },
      },
    };
    assert.deepEqual(
      await suggestDraftSubject(env, { keyword, instructions }),
      suggested,
    );
    assert.equal(calls, 1);
  }
});
