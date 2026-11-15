"use client";

import Link from "next/link";
import { z } from "zod";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  aiDraftReferenceUrlLimit,
  aiDraftReferenceUrlMaxLength,
  aiDraftRequestSchema,
  aiDraftResponseSchema,
  aiDraftSubjectTypeSchema,
  type AiDraftSubjectSuggestion,
  type AiDraftSubjectType,
  categoriesResponseSchema,
  chatGptStatusSchema,
  settingsResponseSchema,
  validationMessages,
} from "@cloudflare-ai-blog/shared";
import { useApiResource } from "@/features/management/use-api-resource";

const subjectTypeLabels = {
  general: "일반 주제",
  film: "영화",
  tv: "드라마·방송",
  game: "게임",
  book: "책",
  product: "제품",
  software: "앱·소프트웨어",
  person: "인물",
  organization: "기업·기관",
  place: "장소",
  event: "행사·사건",
  other: "기타",
} satisfies Record<AiDraftSubjectType, string>;

const chatGptSearchResultSchema = z.object({
  searchCalls: z.number().int().nonnegative(),
  sources: z.array(
    z.object({ title: z.string(), url: z.url({ protocol: /^https$/ }) }),
  ),
});

function ChatGptOptions({
  model,
  onModelChange,
  disabled,
  signInStatus,
}: {
  model: string;
  onModelChange: (model: string) => void;
  disabled: boolean;
  signInStatus?: string;
}) {
  const status = useApiResource("/api/admin/chatgpt", chatGptStatusSchema);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [searchResult, setSearchResult] = useState<z.infer<
    typeof chatGptSearchResultSchema
  > | null>(null);
  const [error, setError] = useState("");

  async function testSearch() {
    if (!model || testing) return;
    setTesting(true);
    setSearchResult(null);
    setError("");
    try {
      const response = await fetch("/api/admin/chatgpt/search-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const problem = z.object({ error: z.string() }).safeParse(value);
        throw new Error(
          problem.data?.error ?? "ChatGPT 웹 검색을 테스트하지 못했어요.",
        );
      }
      setSearchResult(chatGptSearchResultSchema.parse(value));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "ChatGPT 웹 검색을 테스트하지 못했어요.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const result = z.object({ error: z.string() }).safeParse(value);
        throw new Error(
          result.data?.error ?? "ChatGPT 연결을 시작하지 못했어요.",
        );
      }
      const result = z.object({ url: z.url() }).safeParse(value);
      if (!result.success)
        throw new Error("ChatGPT 로그인 주소를 읽을 수 없어요.");
      window.location.assign(result.data.url);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "ChatGPT 연결을 시작하지 못했어요.",
      );
      setConnecting(false);
    }
  }

  const signInError =
    signInStatus === "denied"
      ? "ChatGPT 구독 사용 권한 승인이 취소됐어요."
      : signInStatus === "failed"
        ? "ChatGPT 연결을 완료하지 못했어요. 다시 연결해 주세요."
        : "";
  const account = status.data?.email;
  return (
    <div className="management-form">
      {(error || signInError || status.error) && (
        <p role="alert" className="editor-errors">
          {error || signInError || status.error}
        </p>
      )}
      {status.loading ? (
        <p role="status">ChatGPT 연결 상태 확인 중…</p>
      ) : (
        <>
          <label>
            초안 작성 모델
            <select
              value={model}
              onChange={(event) => {
                setSearchResult(null);
                setError("");
                onModelChange(event.target.value);
              }}
              disabled={
                disabled || connecting || testing || !status.data?.models.length
              }
            >
              <option value="" disabled>
                ChatGPT 모델 선택
              </option>
              {status.data?.models.map(({ slug, name }) => (
                <option key={slug} value={slug}>
                  {name} · ChatGPT 웹 검색 및 본문 작성
                </option>
              ))}
            </select>
          </label>
          {account && <p>연결된 ChatGPT 계정 {account}</p>}
          {status.data?.models.length === 0 && (
            <p>웹에서 출처를 찾으려면 ChatGPT를 연결해 주세요.</p>
          )}
          {model && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={testSearch}
                disabled={disabled || connecting || testing}
              >
                {testing ? "검색 테스트 중…" : "ChatGPT 웹 검색 테스트"}
              </Button>
              {searchResult && (
                <div role="status">
                  <p>
                    {searchResult.searchCalls && searchResult.sources.length
                      ? `검색 ${searchResult.searchCalls}회 실행 및 출처 확인`
                      : searchResult.searchCalls
                        ? "검색은 실행됐지만 출처가 반환되지 않았어요."
                        : "완료된 웹 검색 호출을 확인하지 못했어요."}
                  </p>
                  {searchResult.sources.length > 0 && (
                    <ul>
                      {searchResult.sources.map(({ url, title }) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {title || url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={connect}
              disabled={disabled || connecting || testing}
            >
              {account ? "ChatGPT 다시 연결" : "Continue with ChatGPT"}
            </Button>{" "}
            <a
              href="https://chatgpt.com/settings/usage"
              target="_blank"
              rel="noreferrer"
            >
              ChatGPT 사용량
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export function AiWriting({
  localChatGpt,
  chatGptSignInStatus,
}: {
  localChatGpt: boolean;
  chatGptSignInStatus?: string;
}) {
  const categories = useApiResource(
    "/api/admin/categories",
    categoriesResponseSchema,
  );
  const settings = useApiResource(
    "/api/admin/settings",
    settingsResponseSchema,
  );
  const [keyword, setKeyword] = useState("");
  const [subject, setSubject] = useState<AiDraftSubjectSuggestion | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [referenceFields, setReferenceFields] = useState([{ id: 0, url: "" }]);
  const nextReferenceFieldId = useRef(1);
  const [chatGptModel, setChatGptModel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{ id: string; title: string } | null>(
    null,
  );
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const writing = settings.data?.settings;
  const ready = !!writing && !!categories.data;
  const needsChatGpt = localChatGpt && !!subject && !chatGptModel;
  const referenceUrls = referenceFields
    .map(({ url }) => url.trim())
    .filter(Boolean);

  function edited() {
    requestId.current = null;
    setDraft(null);
    setError("");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || needsChatGpt || submitting.current || draft) return;

    requestId.current ??= crypto.randomUUID();
    const parsed = aiDraftRequestSchema.safeParse({
      requestId: requestId.current,
      keyword,
      categoryId: categoryId || null,
      instructions,
      referenceUrls: referenceUrls.length ? referenceUrls : undefined,
      subject: subject ?? undefined,
      chatGptModel: subject && chatGptModel ? chatGptModel : undefined,
    });
    if (!parsed.success) {
      setError(validationMessages(parsed.error).join("\n"));
      return;
    }

    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ai-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof value === "object" && value && "error" in value
            ? value.error
            : null;
        throw new Error(
          typeof message === "string"
            ? message
            : "AI 초안을 생성하지 못했어요.",
        );
      }
      const result = aiDraftResponseSchema.parse(value);
      if ("subjectToConfirm" in result) {
        requestId.current = null;
        setSubject(result.subjectToConfirm);
      } else {
        setDraft(result);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "AI 초안을 생성하지 못했어요.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">AI WRITING</p>
        <h1>AI 글쓰기</h1>
        <p>키워드로 글 초안을 만들고 편집기에서 다듬을 수 있어요.</p>
      </div>
      {categories.error && (
        <p className="editor-errors" role="alert">
          {categories.error}{" "}
          <button type="button" onClick={categories.reload}>
            카테고리 다시 불러오기
          </button>
        </p>
      )}
      {settings.error && (
        <p className="editor-errors" role="alert">
          {settings.error}{" "}
          <button type="button" onClick={settings.reload}>
            작성 설정 다시 불러오기
          </button>
        </p>
      )}
      <div className="ai-layout">
        <section className="settings-card">
          <h2>새 글 생성 요청</h2>
          <form className="management-form" onSubmit={create}>
            {localChatGpt && (
              <ChatGptOptions
                model={chatGptModel}
                disabled={pending}
                signInStatus={chatGptSignInStatus}
                onModelChange={(model) => {
                  setChatGptModel(model);
                  edited();
                }}
              />
            )}
            {error && (
              <p className="editor-errors" role="alert">
                {error}
              </p>
            )}
            <label>
              키워드
              <input
                required
                value={keyword}
                maxLength={100}
                disabled={pending}
                placeholder="예: 아침 시간을 여유롭게 보내는 방법"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setSubject(null);
                  edited();
                }}
              />
            </label>
            {subject && (
              <div
                className="sample-result"
                role="group"
                aria-labelledby="ai-draft-subject"
              >
                <h3 id="ai-draft-subject">글 대상 확인</h3>
                <p role="status">
                  AI가 제안한 대상이에요. 이름과 유형을 확인하고 필요하면 수정해
                  주세요.
                </p>
                <label>
                  대상 이름
                  <input
                    required
                    value={subject.name}
                    maxLength={150}
                    disabled={pending}
                    onChange={(event) => {
                      setSubject({ ...subject, name: event.target.value });
                      edited();
                    }}
                  />
                </label>
                <label>
                  대상 유형
                  <select
                    required
                    value={subject.type ?? ""}
                    disabled={pending}
                    onChange={(event) => {
                      const type = aiDraftSubjectTypeSchema.safeParse(
                        event.target.value,
                      );
                      setSubject({
                        ...subject,
                        type: type.success ? type.data : null,
                      });
                      edited();
                    }}
                  >
                    <option value="">유형을 선택해 주세요</option>
                    {aiDraftSubjectTypeSchema.options.map((type) => (
                      <option key={type} value={type}>
                        {subjectTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <label>
              카테고리
              <select
                value={categoryId}
                disabled={pending}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  edited();
                }}
              >
                <option value="">미분류</option>
                {categories.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              추가 작성 지시
              <textarea
                rows={4}
                maxLength={2000}
                value={instructions}
                disabled={pending}
                placeholder="예: 초보자가 따라 할 수 있는 예시를 포함해 주세요."
                onChange={(event) => {
                  setInstructions(event.target.value);
                  edited();
                }}
              />
            </label>
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-2 text-xs text-[#4e5c52]">
                참고 URL (선택)
              </legend>
              <p className="text-xs text-muted-foreground">
                글에 사용할 공개 페이지를 최대 {aiDraftReferenceUrlLimit}개
                추가할 수 있어요. 웹 검색을 사용하면 검색으로 찾은 출처도 함께
                읽어요.
              </p>
              {referenceFields.map(({ id, url }, index) => (
                <div key={id} className="flex items-center gap-2">
                  <input
                    aria-label={`참고 URL ${index + 1}`}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={url}
                    maxLength={aiDraftReferenceUrlMaxLength}
                    disabled={pending}
                    onChange={(event) => {
                      const nextUrl = event.target.value;
                      setReferenceFields((fields) =>
                        fields.map((field) =>
                          field.id === id ? { ...field, url: nextUrl } : field,
                        ),
                      );
                      edited();
                    }}
                  />
                  {referenceFields.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label={`참고 URL ${index + 1} 삭제`}
                      disabled={pending}
                      onClick={() => {
                        setReferenceFields((fields) =>
                          fields.filter((field) => field.id !== id),
                        );
                        edited();
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={
                  pending || referenceFields.length >= aiDraftReferenceUrlLimit
                }
                onClick={() => {
                  const id = nextReferenceFieldId.current++;
                  setReferenceFields((fields) => [...fields, { id, url: "" }]);
                  edited();
                }}
              >
                + 참고 URL 추가
              </Button>
            </fieldset>
            {needsChatGpt && <p>초안을 작성할 ChatGPT 모델을 선택해 주세요.</p>}
            <Button
              type="submit"
              disabled={!ready || needsChatGpt || pending || !!draft}
            >
              {subject
                ? localChatGpt
                  ? referenceUrls.length
                    ? "참고 URL과 웹 검색으로 초안 생성"
                    : "출처 검색하고 초안 생성"
                  : "이 대상으로 초안 생성"
                : "대상 확인"}
            </Button>
          </form>
          {pending && (
            <p role="status">
              {subject
                ? "확인한 대상을 기준으로 목차와 본문을 작성하고 있어요."
                : "키워드가 가리키는 대상을 확인하고 있어요."}
            </p>
          )}
          {draft && (
            <div className="sample-result">
              <p role="status">
                초안에 저장했어요. <strong>{draft.title}</strong>
              </p>
              <Link className="outline-button" href={`/posts/${draft.id}/edit`}>
                초안 편집하기 →
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setKeyword("");
                  setSubject(null);
                  setInstructions("");
                  setReferenceFields([{ id: 0, url: "" }]);
                  edited();
                }}
              >
                새 초안 만들기
              </Button>
            </div>
          )}
        </section>
        <aside className="settings-card">
          <h2>작성 기본값</h2>
          <dl className="settings-summary">
            <dt>블로그</dt>
            <dd>{writing?.name ?? "—"}</dd>
            <dt>주제</dt>
            <dd>{writing?.topic || "미설정"}</dd>
            <dt>대상 독자</dt>
            <dd>{writing?.audience || "미설정"}</dd>
            <dt>말투</dt>
            <dd>{writing?.tone || "미설정"}</dd>
            <dt>작성 규칙</dt>
            <dd>{writing?.rules || "미설정"}</dd>
            <dt>피해야 할 표현</dt>
            <dd>{writing?.avoid || "미설정"}</dd>
          </dl>
          <Link className="secondary-link" href="/settings">
            작성 기본값 수정 →
          </Link>
        </aside>
      </div>
    </>
  );
}
