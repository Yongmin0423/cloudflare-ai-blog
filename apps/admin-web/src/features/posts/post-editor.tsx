"use client";

import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { createEditorExtensions } from "./editor-extensions";
import { draftKey, emptyContent, emptyFields, isWebUrl, makeSlug, parseLocalDraft, validateContent, validateFields, type DraftFields, type LocalDraft } from "./editor-model";
import { categoriesResponseSchema, postResponseSchema, postInputSchema, validationMessages, type PostDetail } from "@cloudflare-ai-blog/shared";
import { useApiResource } from "../management/use-api-resource";

function Preview({ fields, content }: { fields: DraftFields; content: JSONContent }) {
  const viewer = useEditor({ extensions: createEditorExtensions(), content, editable: false, immediatelyRender: false });
  return <article className="draft-preview"><p className="eyebrow">{fields.category} · 발행 전 미리보기</p><h1>{fields.title || "제목 없는 초안"}</h1>
    {fields.coverUrl && isWebUrl(fields.coverUrl) && (
      // URL-based preview; R2 assets and optimization will be connected later.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="cover-preview" src={fields.coverUrl} alt={fields.coverAlt} referrerPolicy="no-referrer" />
    )}<EditorContent editor={viewer} /></article>;
}

export function PostEditor({ postId }: { postId?: string }) {
  return postId ? <ExistingPostEditor postId={postId} /> : <EditorForm />;
}
function ExistingPostEditor({postId}:{postId:string}) {
  const resource=useApiResource('/api/admin/posts/'+encodeURIComponent(postId),postResponseSchema);
  if(!resource.ready)return <p role="status">게시글을 불러오는 중이에요.</p>;
  if(resource.error)return <div role="alert" className="editor-errors"><p>{resource.error}</p><Button onClick={resource.reload}>다시 불러오기</Button><Link href="/posts">목록으로</Link></div>;
  if(!resource.data)return null;
  if(resource.data.post.status==='published')return <p>발행 글 수정은 발행 흐름을 연결한 뒤 사용할 수 있어요. <Link href="/posts">목록으로</Link></p>;
  return <EditorForm key={postId} post={resource.data.post} />;
}
function EditorForm({post}:{post?:PostDetail}) {
  const router = useRouter();
  const categories = useApiResource("/api/admin/categories", categoriesResponseSchema);
  const [revision,setRevision]=useState(post?.revision ?? 0);
  const [fields, setFields] = useState<DraftFields>({ ...emptyFields, title: post?.title ?? "", slug: post?.slug ?? "", category: post?.categoryId ?? "미분류", coverUrl:post?.coverUrl??"",coverAlt:post?.coverAlt??"",seoTitle:post?.seoTitle??"",seoDescription:post?.seoDescription??"" });
  const [dirty, setDirty] = useState(false);
  const [bodyLength,setBodyLength]=useState(0);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [availableDraft, setAvailableDraft] = useState<LocalDraft | null>(null);
  const [previewContent, setPreviewContent] = useState<JSONContent | null>(null);
  const [insertMode, setInsertMode] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [insertError, setInsertError] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: "restore" } | { kind: "leave"; href: string } | null>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const allowLeave = useRef(false);
  const savingRef = useRef(false);
  const storageKey = draftKey(post?.id ?? "new");
  const slugLocked = post?.status === "published";
  const editor = useEditor({
    extensions: createEditorExtensions(), immediatelyRender: false,
    content: post?.content ?? emptyContent,
    editorProps: { attributes: { role: "textbox", "aria-label": "본문", "aria-multiline": "true", class: "post-body" } },
    onUpdate: ({editor:current}) => { setBodyLength(current.getText().length);setDirty(true); setMessage(""); },
    onCreate: ({editor:current}) => {
      setBodyLength(current.getText().length);
      try { const stored = localStorage.getItem(storageKey); if (stored) setAvailableDraft(parseLocalDraft(stored)); }
      catch { setErrors(["브라우저 초안을 읽을 수 없어요. 저장소 접근 권한 또는 초안 손상 여부를 확인해 주세요. 기존 데이터는 유지됩니다."]); }
    },
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => ({
    bold: current?.isActive("bold"), italic: current?.isActive("italic"), strike: current?.isActive("strike"),
    h2: current?.isActive("heading", { level: 2 }), h3: current?.isActive("heading", { level: 3 }),
    bullet: current?.isActive("bulletList"), ordered: current?.isActive("orderedList"), quote: current?.isActive("blockquote"),
    link: current?.isActive("link"), undo: current?.can().undo(), redo: current?.can().redo(),
  }) });

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!allowLeave.current) { event.preventDefault(); event.returnValue = ""; } };
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.hash && anchor.pathname === location.pathname) return;
      if (anchor.href !== location.href && ["http:", "https:"].includes(anchor.protocol)) {
        event.preventDefault(); event.stopPropagation();
        returnFocus.current = anchor;
        setConfirmation({ kind: "leave", href: anchor.href });
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  function update(key: keyof DraftFields, value: string) { setFields((previous) => ({ ...previous, [key]: value })); setDirty(true); setMessage(""); }
  async function saveDraft() {
    if (!editor || savingRef.current || !categories.ready || categories.error) return;
    const issues = [...validateFields(fields), ...validateContent(editor.getJSON())];
    setErrors(issues);
    if (issues.length) return;
    savingRef.current = true; setSaving(true);
    try {
      editor.setEditable(false, false);
      const payload=postInputSchema.safeParse({title:fields.title,slug:fields.slug,categoryId:fields.category==="미분류"?null:fields.category,content:editor.getJSON(),coverUrl:fields.coverUrl,coverAlt:fields.coverAlt,seoTitle:fields.seoTitle,seoDescription:fields.seoDescription});
      if(!payload.success) {setErrors(validationMessages(payload.error));return;}
      const response=await fetch(post?'/api/admin/posts/'+post.id:'/api/admin/posts',{method:post?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(post?{post:payload.data,expectedRevision:revision}:payload.data)});
      const value=await response.json();
      if(!response.ok)throw new Error(value && typeof value==='object' && 'error' in value && typeof value.error==='string'?value.error:'초안을 저장하지 못했어요.');
      const saved=postResponseSchema.parse(value).post;
      setRevision(saved.revision);setFields(previous=>({...previous,title:saved.title,slug:saved.slug}));setDirty(false);
      setMessage('로컬 D1에 초안을 저장했어요.');
      if(!post){allowLeave.current=true;router.replace('/posts/'+saved.id+'/edit');}
    } catch(error) { setErrors([error instanceof Error?error.message:"저장하지 못했어요. 입력 내용은 유지됩니다."]); }
    finally { savingRef.current = false; setSaving(false); editor.setEditable(true, false); }
  }
  function restore() {
    if (!editor || !availableDraft) return;
    try {
      let category=availableDraft.fields.category;
      if(category!=="미분류"){
        const match=categories.data?.categories.find(c=>c.id===category||c.name===category);
        if(!match)throw new Error('저장본의 카테고리가 없어 복원할 수 없어요. 카테고리를 먼저 확인해 주세요.');
        category=match.id;
      }
      editor.commands.setContent(availableDraft.content, { emitUpdate: false, errorOnInvalidContent: true });
      setBodyLength(editor.getText().length);
      setFields({ ...availableDraft.fields, category, ...(slugLocked ? { slug: post!.slug } : {}) });
      setDirty(true); setErrors([]); setMessage("브라우저 저장본을 불러왔어요. D1에 초안 저장을 눌러 반영하세요.");
    } catch(error) { setErrors([error instanceof Error?error.message:"본문 형식을 확인해 주세요. 저장본은 유지됩니다."]); }
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
    setPreviewContent(editor.getJSON());
  }
  const tool = (label: string, run: () => void, active = false, disabled = false) => <button key={label} type="button" aria-pressed={active} disabled={!editor || disabled} onClick={run}>{label}</button>;

  return <>
    <div className="posts-heading"><div className="page-heading"><p className="eyebrow">WRITE YOUR STORY</p><h1>{post ? "게시글 수정" : "새 글 작성"}</h1><p>{post ? "저장한 초안을 수정하고 로컬 D1에 반영하세요." : "생각을 글로 옮기고, 발행 전 모습을 확인하세요."}</p></div><Link className="outline-button" href="/posts">목록으로</Link></div>
    <div className="demo-notice"><p><strong>로컬 D1 초안 저장</strong> · 본문·카테고리·검색엔진 설정을 저장해요. 실제 발행과 R2 업로드는 후속 단계입니다. 이전 브라우저 저장본은 자동 이전하지 않아요.</p></div>
    {categories.error && <div role="alert" className="editor-errors"><p>{categories.error}</p><Button onClick={categories.reload}>카테고리 다시 불러오기</Button></div>}
    {availableDraft && <div className="restore-banner"><span>이 글의 브라우저 저장본이 있어요. <time dateTime={availableDraft.savedAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(availableDraft.savedAt))}</time></span><button ref={restoreButton} disabled={!categories.ready || !!categories.error || saving} className="outline-button" type="button" onClick={() => { if (dirty) { returnFocus.current = restoreButton.current; setConfirmation({ kind: "restore" }); } else restore(); }}>저장본 불러오기</button></div>}
    {errors.length > 0 && <div className="editor-errors" role="alert"><strong>입력 내용을 확인해 주세요.</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="editor-grid">
      <section className="editor-main" aria-label="글 작성">
        <label className="field-label" htmlFor="post-title">제목 <span>필수</span></label><input id="post-title" className="title-input" value={fields.title} maxLength={200} placeholder="제목을 입력하세요" onChange={(e) => update("title", e.target.value)} />
        <div className="body-label"><h2>본문</h2><span>{bodyLength}자</span></div>
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
        <section><h2>글 설정</h2><label>슬러그<input value={fields.slug} disabled={slugLocked} maxLength={120} onChange={(e) => update("slug", e.target.value)} /></label>{slugLocked ? <p className="field-help">발행된 글은 URL 유지를 위해 슬러그를 잠갔어요.</p> : <button type="button" className="outline-button" onClick={() => update("slug", makeSlug(fields.title))}>제목으로 슬러그 만들기</button>}<p className="field-help">저장할 때 블로그 내 슬러그 중복을 검사해요.</p><label>카테고리<select value={fields.category} onChange={(e) => update("category", e.target.value)}><option value="미분류">미분류</option>{categories.data?.categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label></section>
        <section><h2>대표 이미지</h2><label>대표 이미지 URL<input type="url" value={fields.coverUrl} placeholder="https://" onChange={(e) => update("coverUrl", e.target.value)} /></label><label>대표 이미지 대체 텍스트<input value={fields.coverAlt} onChange={(e) => update("coverAlt", e.target.value)} /></label><p className="field-help">지금은 URL 입력만 지원해요. 파일 업로드는 R2 연결 단계에서 추가합니다.</p></section>
        <section><h2>검색엔진 설정</h2><label>SEO 제목<input value={fields.seoTitle} maxLength={100} placeholder="비워두면 글 제목 사용" onChange={(e) => update("seoTitle", e.target.value)} /></label><label>SEO 설명<textarea value={fields.seoDescription} maxLength={300} rows={4} onChange={(e) => update("seoDescription", e.target.value)} /></label><p className="field-help">{fields.seoDescription.length}/300자 · 검색 결과 반영은 발행 기능 연결 후 적용됩니다.</p></section>
      </aside>
    </div></fieldset>
    <div className="editor-actionbar"><p role="status">{message || (dirty ? "저장하지 않은 변경 사항이 있어요." : "작성 후 로컬 D1에 초안을 저장할 수 있어요.")}</p><div><button ref={previewButton} type="button" className="outline-button" disabled={!editor} onClick={showPreview}>미리보기</button><button type="button" className="primary-link" disabled={!editor || saving || !categories.ready || !!categories.error} onClick={saveDraft}>{saving ? "저장 중…" : "D1에 초안 저장"}</button><button type="button" className="outline-button" disabled aria-describedby="publish-note">발행</button></div><small id="publish-note">실제 발행은 인증·DB·검수 기능 연결 후 사용할 수 있어요.</small></div>
    <Dialog open={previewContent !== null} onOpenChange={(open) => { if (!open) setPreviewContent(null); }}>
      <DialogContent className="management-dialog editor-preview-modal" onCloseAutoFocus={(event) => { event.preventDefault(); previewButton.current?.focus(); }}>
        <DialogHeader><DialogTitle>본문 미리보기</DialogTitle><DialogDescription>본문 표현 확인용입니다. 공개 블로그 레이아웃은 별도로 구현합니다.</DialogDescription></DialogHeader>
        {previewContent && <Preview fields={{...fields,category:categories.data?.categories.find(c=>c.id===fields.category)?.name??"미분류"}} content={previewContent} />}
        <Button variant="outline" onClick={() => setPreviewContent(null)}>미리보기 닫기</Button>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
      <AlertDialogContent className="management-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.kind === "restore" ? "저장한 초안으로 바꿀까요?" : "저장하지 않고 이동할까요?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.kind === "restore" ? "현재 편집 중인 내용은 브라우저에 저장한 초안으로 대체됩니다." : "저장하지 않은 변경 사항이 있어요. 이동하면 마지막 저장 이후의 변경 내용은 사라집니다."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => {
          if (confirmation?.kind === "restore") restore();
          else if (confirmation?.kind === "leave") {
            const destination = new URL(confirmation.href);
            if (destination.origin === location.origin) { setDirty(false); router.push(destination.pathname + destination.search + destination.hash); }
            else { allowLeave.current = true; location.assign(destination.href); }
          }
        }}>{confirmation?.kind === "restore" ? "저장본 불러오기" : "저장하지 않고 이동"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
