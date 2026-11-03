"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { settingsSchema, settingsResponseSchema, validationMessages, type BlogSettings } from "@cloudflare-ai-blog/shared";
import { useApiResource } from "./use-api-resource";

function SettingsForm({ initial, save, disabled, blogUrl, onSaved, onChanged }: { initial: BlogSettings; save: (value: BlogSettings) => Promise<unknown>; disabled: boolean; blogUrl?: string; onSaved: () => void; onChanged: () => void }) {
  const [fields, setFields] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  function update(key: keyof BlogSettings, value: string) { setFields((previous) => ({ ...previous, [key]: value })); setDirty(true); onChanged(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (disabled || saving) return;
    const normalized = { ...fields, name: fields.name.trim() };
    const parsed = settingsSchema.safeParse(normalized); const issues = parsed.success ? [] : validationMessages(parsed.error); setErrors(issues); if (issues.length) return;
    setSaving(true);
    try { await save(normalized); setDirty(false); onSaved(); }
    catch (error) { setErrors([error instanceof Error ? error.message : "설정을 저장하지 못했어요. 입력 내용은 유지됩니다."]); } finally { setSaving(false); }
  }
  return <form className="management-form settings-form" noValidate onSubmit={submit}>
    {errors.length > 0 && <div className="editor-errors" role="alert"><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <fieldset disabled={disabled || saving} className="settings-fieldset">
      <section className="settings-card"><h2>블로그 기본 정보</h2><p>독자에게 소개할 블로그의 이름과 설명이에요.</p>
        <label>블로그 이름<input value={fields.name} maxLength={80} onChange={(event) => update("name", event.target.value)} /></label>
        <label>소개<textarea rows={3} maxLength={300} value={fields.description} onChange={(event) => update("description", event.target.value)} /></label>
        <label>언어<select value={fields.language} onChange={(event) => update("language", event.target.value)}><option value="ko">한국어</option><option value="en">영어</option><option value="ja">일본어</option></select></label>
        <label>공개 주소<input readOnly value={blogUrl || "공개 주소 연결 전"} /></label><p className="field-help">배포 환경의 BLOG_URL로 관리합니다. 이 화면에서는 변경할 수 없어요.</p>
      </section>
      <section className="settings-card"><h2>AI 작성 기본값</h2><p>나중에 AI로 글을 만들 때 적용할 기본 지침이에요.</p>
        <label>주제<input value={fields.topic} maxLength={300} placeholder="예: 일상과 생활 정보" onChange={(event) => update("topic", event.target.value)} /></label>
        <label>대상 독자<input value={fields.audience} maxLength={300} placeholder="예: 쉽게 실천할 생활 정보를 찾는 독자" onChange={(event) => update("audience", event.target.value)} /></label>
        <label>말투<input value={fields.tone} maxLength={300} onChange={(event) => update("tone", event.target.value)} /></label>
        <label>작성 규칙<textarea rows={5} maxLength={3000} placeholder="예: 결론을 먼저 설명하고, 사실에는 출처를 표시하기" value={fields.rules} onChange={(event) => update("rules", event.target.value)} /></label>
        <label>피해야 할 표현<textarea rows={3} maxLength={3000} value={fields.avoid} onChange={(event) => update("avoid", event.target.value)} /></label>
      </section>
    </fieldset>
    <div className="editor-actionbar"><p>{dirty ? "저장하지 않은 변경 사항이 있어요." : "저장한 설정을 확인하고 수정할 수 있어요."}</p><Button type="submit" disabled={disabled || saving}>{saving ? "저장 중…" : "설정 저장"}</Button></div>
  </form>;
}

export function BlogSettingsManager({ blogUrl }: { blogUrl?: string }) {
  const store = useApiResource("/api/admin/settings", settingsResponseSchema);
  const [message, setMessage] = useState("");
  return <><div className="page-heading"><p className="eyebrow">PREFERENCES</p><h1>블로그 설정</h1><p>블로그의 기본 정보와 AI 작성 방향을 정해 보세요.</p></div>
    <div className="demo-notice"><p><strong>로컬 D1 저장</strong> · 공개 사이트와 실제 AI 생성 연결은 다음 단계입니다. 기존 브라우저 저장본은 삭제하거나 자동 이전하지 않았어요.</p></div>
    {store.error && <div className="editor-errors" role="alert"><p>{store.error}</p><Button variant="outline" onClick={store.reload}>다시 불러오기</Button></div>}
    <p className="management-status" role="status">{message}</p>
    {!store.ready ? <p role="status">설정을 불러오는 중이에요.</p> : store.data && <SettingsForm key={store.data.updatedAt} initial={store.data.settings} save={(settings) => store.mutate("PUT", "/api/admin/settings", { settings, expectedUpdatedAt: store.data!.updatedAt })} disabled={!!store.error} blogUrl={blogUrl} onChanged={() => setMessage("")} onSaved={() => setMessage("로컬 D1에 설정을 저장했어요.")} />}
  </>;
}
