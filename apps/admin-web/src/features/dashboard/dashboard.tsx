"use client";
import Link from "next/link";
import { demoPosts, statusLabels } from "@/features/posts/demo-posts";
import { useLocalDocument } from "@/features/management/use-local-document";
import { initialJobs, jobLabels, jobsKey, parseJobs } from "@/features/ai-writing/demo-jobs";

export function Dashboard() {
  const jobs = useLocalDocument(jobsKey, initialJobs, parseJobs);
  const review = jobs.data.filter((job) => job.status === "review").length;
  const running = jobs.data.filter((job) => ["queued", "running"].includes(job.status)).length;
  const failed = jobs.data.filter((job) => job.status === "failed").length;
  const recent = [...demoPosts].sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0,5);
  const metrics = [
    { label: "전체 게시글", value: demoPosts.length, note: "샘플 게시글 기준" },
    { label: "발행된 글", value: demoPosts.filter((post) => post.status === "published").length, note: "샘플 발행 상태" },
    { label: "초안", value: demoPosts.filter((post) => post.status === "draft").length, note: "샘플 미발행 글" },
  ];
  return <>
    <div className="posts-heading"><div className="page-heading"><p className="eyebrow">MY WORKSPACE</p><h1>대시보드</h1><p>콘텐츠 현황을 살펴보고 다음 이야기를 준비하세요.</p></div><div className="dashboard-actions"><Link href="/posts/new" className="outline-button">직접 글쓰기</Link><Link href="/ai-writing" className="primary-link">✦ AI 글쓰기</Link></div></div>
    <div className="demo-notice"><p><strong>관리자 UI 미리보기</strong> · 게시글 통계는 샘플 데이터, AI 작업은 브라우저 시뮬레이션 기준입니다. 실제 데이터와 방문 통계는 아직 연결되지 않았어요.</p></div>
    <section className="dashboard-metrics" aria-label="콘텐츠 요약">{metrics.map((metric) => <div className="metric-card" key={metric.label}><p>{metric.label}</p><strong>{metric.value}<small>개</small></strong><span>{metric.note}</span></div>)}<div className="metric-card metric-emphasis"><p>AI 검토 대기</p><strong>{jobs.ready && !jobs.error ? review : "—"}<small>개</small></strong><Link href="/ai-writing">샘플 작업 목록 보기 →</Link></div></section>
    <div className="dashboard-grid"><section className="posts-panel" aria-labelledby="recent-posts-title"><div className="section-toolbar"><h2 id="recent-posts-title">최근 수정한 글</h2><Link href="/posts">전체 보기 →</Link></div><div className="table-scroll" role="region" aria-label="최근 수정 글 표" tabIndex={0}><table className="posts-table"><caption className="sr-only">제목, 상태, 수정일</caption><thead><tr><th scope="col">제목</th><th scope="col">상태</th><th scope="col">수정일</th></tr></thead><tbody>{recent.map((post) => <tr key={post.id}><td><span className="post-title">{post.title}</span><p className="field-help">{post.category}</p></td><td><span className={`post-status status-${post.status}`}>{statusLabels[post.status]}</span></td><td><time dateTime={post.updatedAt}>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"short",day:"numeric"}).format(new Date(post.updatedAt))}</time></td></tr>)}</tbody></table></div></section>
    <section className="settings-card" aria-labelledby="job-overview-title"><h2 id="job-overview-title">AI 작업 현황</h2>{jobs.error ? <p className="editor-errors" role="alert">{jobs.error}</p> : !jobs.ready ? <p role="status">샘플 작업을 불러오는 중이에요.</p> : <><div className="job-overview"><p>대기·진행 중<strong>{running}</strong></p><p>검토 대기<strong>{review}</strong></p><p>실패<strong>{failed}</strong></p></div><ul className="dashboard-job-list">{jobs.data.slice(0,3).map((job) => <li key={job.id}><span>{job.keyword}</span><span className={`job-badge job-${job.status}`}>{jobLabels[job.status]}</span></li>)}</ul>{jobs.data.length === 0 && <p>아직 샘플 작업이 없어요.</p>}</>}<Link className="secondary-link" href="/ai-writing">작업 확인하기 →</Link></section></div>
    <section className="analytics-placeholder"><div><h2>방문 통계</h2><p>방문자 수·인기 글·유입 경로는 통계 수집 연결 후 표시됩니다.</p></div><span className="pill">통계 연결 전</span></section>
  </>;
}
