"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { categoriesResponseSchema, categoryInputSchema, validationMessages, type CategoryRecord } from "@cloudflare-ai-blog/shared";
import { categoryErrors, type Category } from "./model";
import { useApiResource } from "./use-api-resource";

export function CategoryManager() {
  const store = useApiResource("/api/admin/categories", categoriesResponseSchema);
  const records = store.data?.categories ?? [];
  const [editing, setEditing] = useState<(Category & { updatedAt?: number; postCount?: number }) | null>(null);
  const [deleting, setDeleting] = useState<(Category & { updatedAt?: number; postCount?: number }) | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const disabled = !store.ready || !!store.error || saving;
  const sorted = [...records].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
  function start(category?: CategoryRecord) {
    setErrors([]);
    setEditing(category ? { ...category } : { id: crypto.randomUUID(), name: "", slug: "", description: "", order: Math.min(999, Math.max(0, ...records.map((item) => item.order)) + 1) });
  }
  async function save() {
    if (!editing || busy.current || disabled) return;
    const next = { ...editing, name: editing.name.trim(), slug: editing.slug.trim().toLowerCase() };
    const issues = categoryErrors(next, records);
    const payload = { name: next.name, slug: next.slug, description: next.description, order: next.order };
    const parsed = categoryInputSchema.safeParse(payload);
    if (!parsed.success) issues.push(...validationMessages(parsed.error));
    if (!records.some((item) => item.id === next.id) && records.length >= 100) issues.push("초기 버전은 카테고리 100개까지 지원해요.");
    setErrors(issues); if (issues.length) return;
    busy.current = true; setSaving(true);
    try {
      const exists = records.some((item) => item.id === next.id);
      await store.mutate(exists ? "PUT" : "POST", exists ? `/api/admin/categories/${next.id}` : "/api/admin/categories", exists ? { category: payload, expectedUpdatedAt: next.updatedAt } : payload);
      setEditing(null); setMessage(`‘${next.name}’ 카테고리를 로컬 D1에 저장했어요.`);
    } catch (error) { setErrors([error instanceof Error ? error.message : "저장하지 못했어요. 입력 내용은 유지됩니다."]); }
    finally { busy.current = false; setSaving(false); }
  }
  async function remove(event: React.MouseEvent) {
    event.preventDefault();
    if (!deleting || disabled || busy.current) return;
    if ((deleting.postCount ?? 0) > 0) { setMessage("게시글이 있는 카테고리는 삭제할 수 없어요."); return; }
    busy.current=true; setSaving(true);
    try { await store.mutate("DELETE", `/api/admin/categories/${deleting.id}`, { expectedUpdatedAt: deleting.updatedAt }); setMessage(`‘${deleting.name}’ 카테고리를 로컬 D1에서 삭제했어요.`); setDeleting(null); }
    catch (error) { setErrors([error instanceof Error?error.message:"삭제하지 못했어요."]); }
    finally {busy.current=false;setSaving(false);}
  }
  return <>
    <div className="posts-heading"><div className="page-heading"><p className="eyebrow">ORGANIZE</p><h1 ref={headingRef} tabIndex={-1}>카테고리</h1><p>글의 주제를 나누고 표시 순서를 정리하세요.</p></div><Button disabled={disabled} onClick={() => start()}>카테고리 추가</Button></div>
    <div className="demo-notice"><p><strong>로컬 D1 저장</strong> · 글 수는 DB 기준입니다. 게시글 화면은 아직 샘플이며 후속 단계에서 연결해요. 기존 브라우저 저장본은 삭제하거나 자동 이전하지 않았어요.</p></div>
    {store.error && <div className="editor-errors" role="alert"><p>{store.error}</p><Button variant="outline" onClick={store.reload}>다시 불러오기</Button></div>}
    <p className="management-status" role="status">{message}</p>
    {!store.ready ? <p role="status">카테고리를 불러오는 중이에요.</p> : store.data && <section className="posts-panel" aria-label="카테고리 목록">
      <div className="list-summary"><p>카테고리 {sorted.length}개</p><span>표시 순서가 같으면 이름순</span></div>
      {sorted.length === 0 ? <div className="list-message"><h2>등록한 카테고리가 없어요.</h2><p>새 카테고리를 만들어 글을 정리해 보세요.</p><Button disabled={disabled} onClick={() => start()}>첫 카테고리 추가</Button></div> : <div className="table-scroll" role="region" aria-label="카테고리 표" tabIndex={0}><table className="posts-table"><caption className="sr-only">카테고리 이름, 슬러그, 글 수, 순서, 관리</caption><thead><tr><th scope="col">이름 / 설명</th><th scope="col">슬러그</th><th scope="col">글 수</th><th scope="col">순서</th><th scope="col">관리</th></tr></thead><tbody>{sorted.map((category) => <tr key={category.id}><td><strong>{category.name}</strong><p className="field-help">{category.description || "설명 없음"}</p></td><td>{category.slug}</td><td>{category.postCount}개</td><td>{category.order}</td><td><div className="row-actions"><Button variant="outline" size="sm" disabled={disabled} aria-label={`${category.name} 수정`} onClick={() => start(category)}>수정</Button><Button variant="outline" size="sm" disabled={disabled || (category.postCount) > 0} aria-label={`${category.name} 삭제`} onClick={() => { setErrors([]); setDeleting(category); }}>삭제</Button></div>{(category.postCount) > 0 && <p className="field-help">소속 글 이동 후 삭제 가능</p>}</td></tr>)}</tbody></table></div>}
    </section>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="management-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus(); }}>
        <DialogHeader><DialogTitle>{records.some((item) => item.id === editing?.id) ? "카테고리 수정" : "카테고리 추가"}</DialogTitle><DialogDescription>로컬 D1에 저장합니다. 이름과 슬러그는 중복될 수 없어요.</DialogDescription></DialogHeader>
        {editing && <form className="management-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
          {errors.length > 0 && <div className="editor-errors" role="alert"><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          <label>이름<input value={editing.name} maxLength={40} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
          <label>슬러그<input value={editing.slug} maxLength={100} placeholder="예: daily-life" onChange={(event) => setEditing({ ...editing, slug: event.target.value })} /></label>
          <label>설명<textarea rows={3} maxLength={300} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
          <label>표시 순서<input type="number" min={1} max={999} step={1} value={Number.isNaN(editing.order) ? "" : editing.order} onChange={(event) => setEditing({ ...editing, order: event.target.valueAsNumber })} /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>취소</Button><Button type="submit" disabled={saving || disabled}>{saving ? "저장 중…" : "저장"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent className="management-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>‘{deleting?.name}’ 카테고리를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>로컬 D1의 카테고리 목록에서 삭제됩니다. 삭제 후에는 같은 이름으로 다시 추가할 수 있어요.</AlertDialogDescription></AlertDialogHeader>{errors.length > 0 && <div role="alert" className="editor-errors">{errors.join(" ")}</div>}<AlertDialogFooter><AlertDialogCancel disabled={saving}>취소</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={remove}>{saving ? "삭제 중…" : "삭제"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
