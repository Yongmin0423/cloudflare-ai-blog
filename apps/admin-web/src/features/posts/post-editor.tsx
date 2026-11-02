"use client";

import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createEditorExtensions } from "./editor-extensions";
import { draftKey, emptyContent, emptyFields, isWebUrl, makeSlug, parseLocalDraft, validateContent, validateFields, type DraftFields, type LocalDraft } from "./editor-model";
import type { PostSummary } from "./demo-posts";

function Preview({ fields, content }: { fields: DraftFields; content: JSONContent }) {
  const viewer = useEditor({ extensions: createEditorExtensions(), content, editable: false, immediatelyRender: false });
  return <article className="draft-preview"><p className="eyebrow">{fields.category} · 발행 전 미리보기</p><h1>{fields.title || "제목 없는 초안"}</h1>
    {fields.coverUrl && isWebUrl(fields.coverUrl) && (
      // URL-based preview; R2 assets and optimization will be connected later.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="cover-preview" src={fields.coverUrl} alt={fields.coverAlt} referrerPolicy="no-referrer" />
    )}<EditorContent editor={viewer} /></article>;
}

export function PostEditor({ post }: { post?: PostSummary }) {
  const [fields, setFields] = useState<DraftFields>({ ...emptyFields, title: post?.title ?? "", slug: post ? makeSlug(post.title) : "", category: post?.category ?? "미분류" });
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [availableDraft, setAvailableDraft] = useState<LocalDraft | null>(null);
  const [previewContent, setPreviewContent] = useState<JSONContent | null>(null);
  const [insertMode, setInsertMode] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [insertError, setInsertError] = useState("");
  const previewDialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const storageKey = draftKey(post?.id ?? "new");
  const slugLocked = post?.status === "published";
  const editor = useEditor({
    extensions: createEditorExtensions(), immediatelyRender: false,
    content: post ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "이 글은 편집 화면을 확인하기 위한 샘플 본문입니다. 자유롭게 수정해 보세요." }] }] } : emptyContent,
    editorProps: { attributes: { role: "textbox", "aria-label": "본문", "aria-multiline": "true", class: "post-body" } },
    onUpdate: () => { setDirty(true); setMessage(""); },
    onCreate: () => {
      try { const stored = localStorage.getItem(storageKey); if (stored) setAvailableDraft(parseLocalDraft(stored)); }
      catch { setErrors(["브라우저 초안을 읽을 수 없어요. 저장소 접근 권한 또는 초안 손상 여부를 확인해 주세요. 기존 데이터는 유지됩니다."]); }
    },
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => ({
    bold: current?.isActive("bold"), italic: current?.isActive("italic"), strike: current?.isActive("strike"),
    h2: current?.isActive("heading", { level: 2 }), h3: current?.isActive("heading", { level: 3 }),
    bullet: current?.isActive("bulletList"), ordered: current?.isActive("orderedList"), quote: current?.isActive("blockquote"),
    link: current?.isActive("link"), undo: current?.can().undo(), redo: current?.can().redo(), length: current?.getText().length ?? 0,
  }) });

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.hash && anchor.pathname === location.pathname) return;
      if (anchor.href !== location.href && !window.confirm("저장하지 않은 변경 사항이 있어요. 이 페이지를 떠날까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  function update(key: keyof DraftFields, value: string) { setFields((previous) => ({ ...previous, [key]: value })); setDirty(true); setMessage(""); }
  function saveDraft() {
    if (!editor || savingRef.current) return;
    const issues = [...validateFields(fields), ...validateContent(editor.getJSON())];
    setErrors(issues);
    if (issues.length) return;
    savingRef.current = true; setSaving(true);
    try {
      const record: LocalDraft = { version: 1, fields, content: editor.getJSON(), savedAt: new Date().toISOString() };
      const serialized = JSON.stringify(record);
      parseLocalDraft(serialized);
      localStorage.setItem(storageKey, serialized);
      setAvailableDraft(record); setDirty(false);
      setMessage("이 브라우저에 초안을 저장했어요. 서버 저장이나 발행은 되지 않습니다.");
    } catch { setErrors(["초안을 저장하지 못했어요. 브라우저 저장 공간 또는 접근 권한을 확인해 주세요. 작성 내용은 화면에 남아 있습니다."]); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function restore() {
    if (!editor || !availableDraft || (dirty && !window.confirm("현재 내용을 이 브라우저에 저장한 초안으로 바꿀까요?"))) return;
    try {
      editor.commands.setContent(availableDraft.content, { emitUpdate: false, errorOnInvalidContent: true });
      setFields({ ...availableDraft.fields, ...(slugLocked ? { slug: makeSlug(post!.title) } : {}) });
      setDirty(false); setErrors([]); setMessage("브라우저에 저장한 초안을 불러왔어요.");
    } catch { setErrors(["본문 형식이 올바르지 않아 복원할 수 없어요. 저장된 초안은 유지됩니다."]); }
  }
  function insert() {
    if (!editor) return;
    if (!isWebUrl(url.trim())) { setInsertError("올바른 http 또는 https 주소를 입력해 주세요."); return; }
    if (insertMode === "image" && !alt.trim()) { setInsertError("이미지를 설명하는 대체 텍스트를 입력해 주세요."); return; }
    if (insertMode === "image") editor.chain().focus().setImage({ src: url.trim(), alt: alt.trim() }).run();
    else if (editor.state.selection.empty && !editor.isActive("link")) { setInsertError("링크를 걸 본문 텍스트를 먼저 선택해 주세요."); return; }
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    setInsertMode(null); setInsertError("");
  }
  function showPreview() {
    if (!editor) return;
    const issues = [...validateContent(editor.getJSON()), ...(fields.coverUrl && !isWebUrl(fields.coverUrl) ? ["대표 이미지 URL을 확인해 주세요."] : [])];
    setErrors(issues); if (issues.length) return;
    setPreviewContent(editor.getJSON()); previewDialog.current?.showModal();
  }
  const tool = (label: string, run: () => void, active = false, disabled = false) => <button key={label} type="button" aria-pressed={active} disabled={!editor || disabled} onClick={run}>{label}</button>;

  return <>
    <div className="posts-heading"><div className="page-heading"><p className="eyebrow">WRITE YOUR STORY</p><h1>{post ? "게시글 수정" : "새 글 작성"}</h1><p>{post ? "샘플 글을 수정하고 브라우저에 초안을 보관하세요." : "생각을 글로 옮기고, 발행 전 모습을 확인하세요."}</p></div><Link className="outline-button" href="/posts">목록으로</Link></div>
    <div className="demo-notice"><p><strong>브라우저 임시 저장 단계</strong> · 서버 저장·R2 업로드·실제 발행은 아직 연결되지 않았어요. {post ? "샘플 목록에는 수정이 반영되지 않아요." : "새 글은 최근 저장한 초안 1개를 이 브라우저에 보관해요."}</p></div>
    {availableDraft && <div className="restore-banner"><span>이 글의 브라우저 저장본이 있어요. <time dateTime={availableDraft.savedAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(availableDraft.savedAt))}</time></span><button className="outline-button" type="button" onClick={restore}>저장본 불러오기</button></div>}
    {errors.length > 0 && <div className="editor-errors" role="alert"><strong>입력 내용을 확인해 주세요.</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <div className="editor-grid">
      <section className="editor-main" aria-label="글 작성">
        <label className="field-label" htmlFor="post-title">제목 <span>필수</span></label><input id="post-title" className="title-input" value={fields.title} maxLength={200} placeholder="제목을 입력하세요" onChange={(e) => update("title", e.target.value)} />
        <div className="body-label"><h2>본문</h2><span>{state?.length ?? 0}자</span></div>
        <div className="editor-toolbar" role="group" aria-label="본문 서식">
          {tool("문단", () => editor?.chain().focus().setParagraph().run())}
          {tool("H2", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), state?.h2)}
          {tool("H3", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), state?.h3)}
          {tool("굵게", () => editor?.chain().focus().toggleBold().run(), state?.bold)}
          {tool("기울임", () => editor?.chain().focus().toggleItalic().run(), state?.italic)}
          {tool("취소선", () => editor?.chain().focus().toggleStrike().run(), state?.strike)}
          {tool("글머리 목록", () => editor?.chain().focus().toggleBulletList().run(), state?.bullet)}
          {tool("번호 목록", () => editor?.chain().focus().toggleOrderedList().run(), state?.ordered)}
          {tool("인용", () => editor?.chain().focus().toggleBlockquote().run(), state?.quote)}
          {tool("구분선", () => editor?.chain().focus().setHorizontalRule().run())}
          {tool("링크", () => { setInsertMode("link"); setUrl(editor?.getAttributes("link").href ?? ""); setInsertError(""); }, state?.link)}
          {tool("링크 해제", () => editor?.chain().focus().extendMarkRange("link").unsetLink().run(), false, !state?.link)}
          {tool("이미지", () => { setInsertMode("image"); setUrl(""); setAlt(""); setInsertError(""); })}
          {tool("실행 취소", () => editor?.chain().focus().undo().run(), false, !state?.undo)}
          {tool("다시 실행", () => editor?.chain().focus().redo().run(), false, !state?.redo)}
        </div>
        {insertMode && <div className="insert-panel"><label>{insertMode === "link" ? "링크 URL" : "본문 이미지 URL"}<input type="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} /></label>{insertMode === "image" && <label>본문 이미지 대체 텍스트<input value={alt} onChange={(e) => setAlt(e.target.value)} /></label>}{insertError && <p role="alert">{insertError}</p>}<div className="empty-actions"><button className="outline-button" type="button" onClick={insert}>적용</button><button className="outline-button" type="button" onClick={() => setInsertMode(null)}>취소</button></div></div>}
        {!editor && <p role="status">편집기를 불러오는 중이에요.</p>}
        <EditorContent editor={editor} />
      </section>
      <aside className="editor-settings" aria-label="글 설정">
        <section><h2>글 설정</h2><label>슬러그<input value={fields.slug} disabled={slugLocked} maxLength={120} onChange={(e) => update("slug", e.target.value)} /></label>{slugLocked ? <p className="field-help">발행된 샘플 글은 URL 유지를 위해 슬러그를 잠갔어요.</p> : <button type="button" className="outline-button" onClick={() => update("slug", makeSlug(fields.title))}>제목으로 슬러그 만들기</button>}<p className="field-help">블로그 내 중복 여부는 DB 연결 후 검사합니다.</p><label>카테고리<select value={fields.category} onChange={(e) => update("category", e.target.value)}>{["미분류", "블로그 운영", "생활 정보", "일상"].map((category) => <option key={category}>{category}</option>)}</select></label></section>
        <section><h2>대표 이미지</h2><label>대표 이미지 URL<input type="url" value={fields.coverUrl} placeholder="https://" onChange={(e) => update("coverUrl", e.target.value)} /></label><label>대표 이미지 대체 텍스트<input value={fields.coverAlt} onChange={(e) => update("coverAlt", e.target.value)} /></label><p className="field-help">지금은 URL 입력만 지원해요. 파일 업로드는 R2 연결 단계에서 추가합니다.</p></section>
        <section><h2>검색엔진 설정</h2><label>SEO 제목<input value={fields.seoTitle} maxLength={100} placeholder="비워두면 글 제목 사용" onChange={(e) => update("seoTitle", e.target.value)} /></label><label>SEO 설명<textarea value={fields.seoDescription} maxLength={300} rows={4} onChange={(e) => update("seoDescription", e.target.value)} /></label><p className="field-help">{fields.seoDescription.length}/300자 · 검색 결과 반영은 발행 기능 연결 후 적용됩니다.</p></section>
      </aside>
    </div>
    <div className="editor-actionbar"><p role="status">{message || (dirty ? "저장하지 않은 변경 사항이 있어요." : "작성 후 브라우저에 초안을 저장할 수 있어요.")}</p><div><button type="button" className="outline-button" disabled={!editor} onClick={showPreview}>미리보기</button><button type="button" className="primary-link" disabled={!editor || saving} onClick={saveDraft}>{saving ? "저장 중…" : "브라우저에 초안 저장"}</button><button type="button" className="outline-button" disabled aria-describedby="publish-note">발행</button></div><small id="publish-note">실제 발행은 인증·DB·검수 기능 연결 후 사용할 수 있어요.</small></div>
    <dialog ref={previewDialog} className="preview-dialog" aria-labelledby="preview-heading" onClose={() => setPreviewContent(null)}><div className="preview-topbar"><h2 id="preview-heading">본문 미리보기</h2><button className="outline-button" type="button" onClick={() => previewDialog.current?.close()}>닫기</button></div><p className="field-help">본문 표현 확인용입니다. 공개 블로그 레이아웃은 별도로 구현합니다.</p>{previewContent && <Preview fields={fields} content={previewContent} />}</dialog>
  </>;
}
