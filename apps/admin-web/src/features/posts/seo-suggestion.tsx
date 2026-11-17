"use client";

import { useEffect, useRef, useState } from "react";
import {
  postSeoResponseSchema,
  type PostSeoSuggestion,
} from "@cloudflare-ai-blog/shared";
import { Button } from "@/components/ui/button";
import { request } from "../management/use-api-resource";

export function SeoSuggestion({
  postId,
  revision,
  dirty,
  disabled,
  onApply,
}: {
  postId: string;
  revision: number;
  dirty: boolean;
  disabled: boolean;
  onApply: (suggestion: PostSeoSuggestion) => void;
}) {
  const [suggestion, setSuggestion] = useState<PostSeoSuggestion | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function suggest() {
    if (disabled || dirty || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError("");
    setSuggestion(null);
    try {
      const result = await request(
        `/api/admin/posts/${postId}/seo`,
        postSeoResponseSchema,
        "POST",
        { expectedRevision: revision },
        controller.signal,
      );
      if (!controller.signal.aborted) setSuggestion(result.suggestion);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "SEO 제안을 받지 못했어요.",
        );
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void suggest()}
          disabled={disabled || dirty || pending}
        >
          {pending ? "SEO 제안 작성 중…" : "AI SEO 제안 받기"}
        </Button>
      </div>
      {dirty && (
        <p className="field-help">
          최신 내용으로 제안을 받으려면 먼저 저장해 주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="editor-errors">
          {error}
        </p>
      )}
      {suggestion && !dirty && (
        <div className="sample-result">
          <p>
            <strong>제안 제목</strong>
            <br />
            {suggestion.seoTitle}
          </p>
          <p>
            <strong>제안 설명</strong>
            <br />
            {suggestion.seoDescription}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onApply(suggestion);
                setSuggestion(null);
              }}
            >
              SEO 제목·설명에 적용
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
