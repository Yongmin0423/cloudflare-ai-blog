"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLocalDocument } from "@/features/management/use-local-document";
import { categoriesResponseSchema, settingsResponseSchema } from "@cloudflare-ai-blog/shared";
import { useApiResource } from "@/features/management/use-api-resource";
import { advanceJob, initialJobs, jobLabels, jobStages, jobsKey, parseJobs, requestErrors, retryJob, type DemoJob } from "./demo-jobs";

export function AiWriting() {
  const store = useLocalDocument(jobsKey, initialJobs, parseJobs);
  const categories = useApiResource("/api/admin/categories", categoriesResponseSchema);
  const settings = useApiResource("/api/admin/settings", settingsResponseSchema);
  const [keyword, setKeyword] = useState(""); const [category, setCategory] = useState("미분류");
  const [instructions, setInstructions] = useState(""); const [errors, setErrors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all"); const [message, setMessage] = useState("");
  const [jobError, setJobError] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const selected = store.data.find((job) => job.id === selectedId);
  const disabled = !store.ready || !!store.error;
  const formDisabled = disabled || !categories.ready || !settings.ready || !!categories.error || !!settings.error || !categories.data || !settings.data;
  function persist(jobs: DemoJob[]) {
    try { store.save(jobs); setJobError(""); return true; }
    catch { const error = "샘플 작업을 저장하지 못했어요. 브라우저 저장 공간과 권한을 확인해 주세요."; setMessage(error); setJobError(error); return false; }
  }
  function create(event: React.FormEvent) {
    event.preventDefault(); if (formDisabled) return;
    const issues = requestErrors(keyword, instructions); if (store.data.length >= 100) issues.push("샘플 작업은 최대 100개까지 보관할 수 있어요.");
    if (category !== "미분류" && !(categories.data?.categories ?? []).some((item) => item.name === category)) issues.push("카테고리가 변경됐어요. 다시 선택해 주세요.");
    setErrors(issues); if (issues.length) return;
    const job: DemoJob = { id: crypto.randomUUID(), keyword: keyword.trim(), category, instructions, status: "queued", step: 0, createdAt: new Date().toISOString() };
    if (persist([job, ...store.data])) { setKeyword(""); setInstructions(""); setFilter("all"); setMessage("샘플 작업을 추가했어요. 실제 AI는 호출하지 않았습니다."); setSelectedId(job.id); returnFocus.current = document.getElementById("sample-submit"); }
  }
  function change(job: DemoJob) { persist(store.data.map((item) => item.id === job.id ? job : item)); }
  const jobs = store.data.filter((job) => filter === "all" || job.status === filter);
  return <>
    <div className="page-heading"><p className="eyebrow">AI WRITING</p><h1>AI 글쓰기</h1><p>키워드로 초안을 만들고, 검토한 뒤 발행하는 흐름을 준비하세요.</p></div>
    <div className="demo-notice"><p><strong>AI 작업 UI 시뮬레이션</strong> · 실제 AI 호출·과금·본문 생성·발행은 하지 않습니다. 버튼으로 단계별 화면을 확인하며 이 브라우저에 샘플 작업을 보관합니다.</p></div>
    {[store.error, categories.error, settings.error].filter(Boolean).map((error, i) => <p key={i} className="editor-errors" role="alert">{error}</p>)}
    <p className="management-status" role="status">{message}</p>
    <div className="ai-layout"><section className="settings-card"><h2>새 글 생성 요청</h2><form className="management-form" noValidate onSubmit={create}>
      {errors.length > 0 && <div className="editor-errors" role="alert"><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      <label>키워드 <span className="field-help">필수 · 글 한 편의 중심 주제</span><input value={keyword} maxLength={100} placeholder="예: 아침 시간을 여유롭게 보내는 방법" onChange={(e) => setKeyword(e.target.value)} /></label>
      <label>카테고리<select value={category} onChange={(e) => setCategory(e.target.value)}><option>미분류</option>{(categories.data?.categories ?? []).map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
      <label>추가 작성 지시<textarea rows={4} maxLength={2000} value={instructions} placeholder="예: 초보자도 이해할 수 있도록 사례를 포함해 주세요." onChange={(e) => setInstructions(e.target.value)} /></label>
      <Button id="sample-submit" type="submit" disabled={formDisabled}>샘플 생성 흐름 시작</Button>
    </form></section>
    <aside className="settings-card"><h2>적용 예정인 작성 기본값</h2><p>로컬 D1에 저장한 블로그 설정을 보여줍니다. 실제 AI 연결 시 요청에 포함할 정보예요.</p><dl className="settings-summary"><dt>블로그</dt><dd>{settings.data?.settings.name ?? "불러오는 중"}</dd><dt>주제</dt><dd>{settings.data?.settings.topic || "아직 설정하지 않았어요"}</dd><dt>대상 독자</dt><dd>{settings.data?.settings.audience || "아직 설정하지 않았어요"}</dd><dt>말투</dt><dd>{settings.data?.settings.tone || "미설정"}</dd><dt>작성 규칙</dt><dd>{settings.data?.settings.rules || "미설정"}</dd></dl><Link className="secondary-link" href="/settings">작성 기본값 수정 →</Link></aside></div>
    <section className="posts-panel ai-jobs" aria-labelledby="jobs-title"><div className="section-toolbar"><h2 id="jobs-title">생성 작업</h2><label>작업 상태<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">전체</option>{Object.entries(jobLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {!store.ready ? <p className="list-message" role="status">작업을 불러오는 중이에요.</p> : jobs.length === 0 ? <div className="list-message"><h3>표시할 작업이 없어요.</h3><p>다른 상태를 선택하거나 새 샘플 작업을 시작해 보세요.</p><Button variant="outline" onClick={() => setFilter("all")}>전체 작업 보기</Button></div> : <div className="table-scroll" role="region" aria-label="AI 작업 표" tabIndex={0}><table className="posts-table"><caption className="sr-only">키워드, 상태, 진행 단계, 요청 시각, 상세</caption><thead><tr><th scope="col">키워드</th><th scope="col">상태</th><th scope="col">진행</th><th scope="col">요청 시각</th><th scope="col">상세</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.keyword}</strong><p className="field-help">{job.category}</p></td><td><span className={`job-badge job-${job.status}`}>{jobLabels[job.status]}</span></td><td>{job.step}/5</td><td><time dateTime={job.createdAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(job.createdAt))}</time></td><td><Button variant="outline" size="sm" disabled={disabled} aria-label={`${job.keyword} 작업 보기`} onClick={(event) => { returnFocus.current = event.currentTarget; setSelectedId(job.id); }}>작업 보기</Button></td></tr>)}</tbody></table></div>}
    </section>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}><DialogContent className="management-dialog ai-job-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}><DialogHeader><DialogTitle>샘플 작업 · {selected?.keyword}</DialogTitle><DialogDescription>화면 흐름 확인용입니다. 실제 콘텐츠나 검증 결과가 아닙니다.</DialogDescription></DialogHeader>
      {jobError && <p className="editor-errors" role="alert">{jobError}</p>}
      {selected && <><p><span className={`job-badge job-${selected.status}`}>{jobLabels[selected.status]}</span></p><ol className="job-steps">{jobStages.map((stage, index) => <li key={stage} className={index < selected.step ? "step-done" : index === selected.step ? "step-current" : ""}><span aria-hidden="true">{index < selected.step ? "✓" : index + 1}</span><div><strong>{stage}</strong><small>{index < selected.step ? "완료 예시" : index === selected.step && selected.status === "failed" ? "실패 예시" : index === selected.step && selected.status === "running" ? "진행 중 예시" : "대기"}</small></div></li>)}</ol>
      {selected.status === "failed" && <div className="editor-errors" role="alert"><strong>QA 검증 실패 예시</strong><p>출처 확인에 실패한 상황을 보여줍니다. 재시도하면 이 단계부터 이어갑니다.</p></div>}
      {["queued", "running"].includes(selected.status) && <div className="row-actions"><Button disabled={disabled} onClick={() => change(advanceJob(selected))}>{selected.status === "queued" ? "진행 화면 보기" : "다음 단계 보기"}</Button>{selected.status === "running" && <Button variant="outline" disabled={disabled} onClick={() => change({ ...selected, status: "failed", step: 4 })}>QA 실패 화면 보기</Button>}</div>}
      {selected.status === "failed" && <Button disabled={disabled} onClick={() => change(retryJob(selected))}>현재 단계 재시도 예시</Button>}
      {["review", "completed"].includes(selected.status) && <div className="sample-result"><h3>생성 결과 예시</h3><p>요청 키워드: {selected.keyword}</p><p>완료 예시에서는 본문·SEO·이미지·내부 링크·QA 결과를 확인한 뒤 편집기로 넘어갑니다.</p><dl className="settings-summary"><dt>SEO</dt><dd>제목·설명 제안 확인 예정</dd><dt>이미지·링크</dt><dd>실제 생성·검증 결과 연결 예정</dd><dt>QA</dt><dd>통과 화면 예시 · 실제 검증 아님</dd></dl><Link className="outline-button" href="/posts/new">새 글 편집기 열기 →</Link>{selected.status === "review" && <Button disabled={disabled} variant="outline" onClick={() => change({ ...selected, status: "completed" })}>검토 완료 화면 보기</Button>}<p className="field-help">이 요청으로 새 초안이 생성되지는 않습니다. 실제 승인은 최신 검증 결과와 연결한 뒤 활성화합니다.</p><Button disabled>실제 승인·발행 연결 전</Button></div>}
      </>}
    </DialogContent></Dialog>
  </>;
}
