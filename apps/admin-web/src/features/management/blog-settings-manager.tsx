"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadBlogImage } from "@/lib/upload-blog-image";
import {
  settingsSchema,
  settingsResponseSchema,
  validationMessages,
  type BlogSettings,
} from "@cloudflare-ai-blog/shared";
import { useApiResource } from "./use-api-resource";

function SettingsForm({
  initial,
  save,
  disabled,
  blogUrl,
  onSaved,
  onChanged,
}: {
  initial: BlogSettings;
  save: (value: BlogSettings) => Promise<unknown>;
  disabled: boolean;
  blogUrl?: string;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const [fields, setFields] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  function markChanged() {
    setDirty(true);
    onChanged();
  }
  function update(key: Exclude<keyof BlogSettings, "seo">, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    markChanged();
  }
  function updateSeo(changes: Partial<BlogSettings["seo"]>) {
    setFields((previous) => ({
      ...previous,
      seo: { ...previous.seo, ...changes },
    }));
    markChanged();
  }
  async function uploadShareImage(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const { mediaId } = await uploadBlogImage(file);
      updateSeo({ shareMediaId: mediaId, shareImageAlt: "" });
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "이미지를 업로드하지 못했어요.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || saving || uploading) return;
    const parsed = settingsSchema.safeParse(fields);
    if (!parsed.success) {
      setErrors(validationMessages(parsed.error));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await save(parsed.data);
      setDirty(false);
      onSaved();
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "설정을 저장하지 못했어요. 입력 내용은 유지됩니다.",
      ]);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="management-form settings-form"
      noValidate
      onSubmit={submit}
    >
      {errors.length > 0 && (
        <div className="editor-errors" role="alert">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset
        disabled={disabled || saving || uploading}
        className="settings-fieldset"
      >
        <section className="settings-card">
          <h2>블로그 기본 정보</h2>
          <p>독자에게 소개할 블로그의 이름과 설명이에요.</p>
          <label>
            블로그 이름
            <input
              value={fields.name}
              maxLength={80}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>
          <label>
            소개
            <textarea
              rows={3}
              maxLength={300}
              value={fields.description}
              onChange={(event) => update("description", event.target.value)}
            />
          </label>
          <label>
            언어
            <select
              value={fields.language}
              onChange={(event) => update("language", event.target.value)}
            >
              <option value="ko">한국어</option>
              <option value="en">영어</option>
              <option value="ja">일본어</option>
            </select>
          </label>
          <label>
            공개 주소
            <input readOnly value={blogUrl || "공개 주소 연결 전"} />
          </label>
          <p className="field-help">
            배포 환경의 BLOG_URL로 관리합니다. 이 화면에서는 변경할 수 없어요.
          </p>
        </section>
        <section className="settings-card">
          <h2>AI 작성 기본값</h2>
          <p>나중에 AI로 글을 만들 때 적용할 기본 지침이에요.</p>
          <label>
            주제
            <input
              value={fields.topic}
              maxLength={300}
              placeholder="예: 일상과 생활 정보"
              onChange={(event) => update("topic", event.target.value)}
            />
          </label>
          <label>
            대상 독자
            <input
              value={fields.audience}
              maxLength={300}
              placeholder="예: 쉽게 실천할 생활 정보를 찾는 독자"
              onChange={(event) => update("audience", event.target.value)}
            />
          </label>
          <label>
            말투
            <input
              value={fields.tone}
              maxLength={300}
              onChange={(event) => update("tone", event.target.value)}
            />
          </label>
          <label>
            작성 규칙
            <textarea
              rows={5}
              maxLength={3000}
              placeholder="예: 결론을 먼저 설명하고, 사실에는 출처를 표시하기"
              value={fields.rules}
              onChange={(event) => update("rules", event.target.value)}
            />
          </label>
          <label>
            피해야 할 표현
            <textarea
              rows={3}
              maxLength={3000}
              value={fields.avoid}
              onChange={(event) => update("avoid", event.target.value)}
            />
          </label>
        </section>
        <section className="settings-card">
          <h2>블로그 공통 SEO</h2>
          <p>
            홈을 검색하거나 공유할 때 사용하는 제목과 설명이에요. 비워 두면
            블로그 이름과 소개를 사용해요.
          </p>
          <label>
            홈 SEO 제목
            <input
              value={fields.seo.title}
              maxLength={100}
              onChange={(event) => updateSeo({ title: event.target.value })}
            />
          </label>
          <label>
            홈 SEO 설명
            <textarea
              rows={3}
              value={fields.seo.description}
              maxLength={300}
              onChange={(event) =>
                updateSeo({ description: event.target.value })
              }
            />
          </label>
          <label>
            기본 공유 이미지
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadShareImage(file);
              }}
            />
          </label>
          <p className="field-help">
            홈과 대표 이미지가 없는 글을 공유할 때 사용해요. JPG, PNG, WebP
            파일을 5MB까지 올릴 수 있어요.
          </p>
          {uploading && <p role="status">이미지를 업로드하고 있어요.</p>}
          {uploadError && (
            <p className="editor-errors" role="alert">
              {uploadError}
            </p>
          )}
          {fields.seo.shareMediaId && (
            <div>
              {/* The private preview requires the admin session cookie. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="cover-preview"
                src={`/api/admin/media/${fields.seo.shareMediaId}`}
                width={320}
                alt={fields.seo.shareImageAlt || "기본 공유 이미지 미리보기"}
              />
              <label>
                이미지 대체 텍스트
                <input
                  value={fields.seo.shareImageAlt}
                  maxLength={500}
                  required
                  onChange={(event) =>
                    updateSeo({ shareImageAlt: event.target.value })
                  }
                />
              </label>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setUploadError("");
                  updateSeo({ shareMediaId: null, shareImageAlt: "" });
                }}
              >
                공유 이미지 제거
              </Button>
            </div>
          )}
        </section>
      </fieldset>
      <div className="editor-actionbar">
        <p>
          {dirty
            ? "저장하지 않은 변경 사항이 있어요."
            : "저장한 설정을 확인하고 수정할 수 있어요."}
        </p>
        <Button type="submit" disabled={disabled || saving || uploading}>
          {saving ? "저장 중…" : "설정 저장"}
        </Button>
      </div>
    </form>
  );
}

export function BlogSettingsManager({ blogUrl }: { blogUrl?: string }) {
  const store = useApiResource("/api/admin/settings", settingsResponseSchema);
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1>블로그 설정</h1>
        <p>블로그의 기본 정보, 공통 SEO, AI 작성 방향을 관리해요.</p>
      </div>
      {store.error && (
        <div className="editor-errors" role="alert">
          <p>{store.error}</p>
          <Button variant="outline" onClick={store.reload}>
            다시 불러오기
          </Button>
        </div>
      )}
      <p className="management-status" role="status">
        {message}
      </p>
      {!store.ready ? (
        <p role="status">설정을 불러오는 중이에요.</p>
      ) : (
        store.data && (
          <SettingsForm
            key={store.data.updatedAt}
            initial={store.data.settings}
            save={(settings) =>
              store.mutate("PUT", "/api/admin/settings", {
                settings,
                expectedUpdatedAt: store.data!.updatedAt,
              })
            }
            disabled={!!store.error}
            blogUrl={blogUrl}
            onChanged={() => setMessage("")}
            onSaved={() => setMessage("블로그 설정을 저장했어요.")}
          />
        )
      )}
    </>
  );
}
