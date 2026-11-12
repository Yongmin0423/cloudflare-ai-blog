"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  aiDraftRequestSchema,
  aiDraftResponseSchema,
  categoriesResponseSchema,
  settingsResponseSchema,
  validationMessages,
} from "@cloudflare-ai-blog/shared";
import { useApiResource } from "@/features/management/use-api-resource";

export function AiWriting() {
  const categories = useApiResource(
    "/api/admin/categories",
    categoriesResponseSchema,
  );
  const settings = useApiResource(
    "/api/admin/settings",
    settingsResponseSchema,
  );
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{ id: string; title: string } | null>(
    null,
  );
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const writing = settings.data?.settings;
  const ready = !!writing && !!categories.data;

  function edited() {
    requestId.current = null;
    setDraft(null);
    setError("");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current || draft) return;

    requestId.current ??= crypto.randomUUID();
    const parsed = aiDraftRequestSchema.safeParse({
      requestId: requestId.current,
      keyword,
      categoryId: categoryId || null,
      instructions,
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
      setDraft(aiDraftResponseSchema.parse(value));
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
                  edited();
                }}
              />
            </label>
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
            <Button type="submit" disabled={!ready || pending || !!draft}>
              {pending ? "초안 생성 중…" : "AI 초안 생성"}
            </Button>
          </form>
          {pending && (
            <p role="status">
              검색 의도를 파악하고 목차와 본문을 작성하고 있어요.
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
                  setInstructions("");
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
