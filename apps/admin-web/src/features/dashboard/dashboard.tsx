"use client";

import Link from "next/link";
import {
  postDashboardResponseSchema,
  type AiJobStatus,
} from "@cloudflare-ai-blog/shared";
import { useApiResource } from "@/features/management/use-api-resource";
import { statusLabels } from "@/features/posts/post-status";

const metrics = [
  { key: "total", label: "전체 게시글", href: "/posts" },
  { key: "published", label: "발행된 글", href: "/posts?status=published" },
  { key: "draft", label: "초안", href: "/posts?status=draft" },
  { key: "private", label: "비공개 글", href: "/posts?status=private" },
] as const;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "short",
});

const jobLabels: Record<AiJobStatus, string> = {
  running: "진행 중",
  review: "검토 대기",
  failed: "실패",
  unconfirmed: "응답 없음",
};

export function Dashboard() {
  const posts = useApiResource(
    "/api/admin/dashboard",
    postDashboardResponseSchema,
  );
  const recent = posts.data?.recentPosts ?? [];
  const jobs = posts.data?.aiJobs;

  return (
    <>
      <div className="posts-heading">
        <div className="page-heading">
          <p className="eyebrow">MY WORKSPACE</p>
          <h1>대시보드</h1>
          <p>콘텐츠 현황을 살펴보고 다음 이야기를 준비하세요.</p>
        </div>
        <div className="dashboard-actions">
          <Link href="/posts/new" className="outline-button">
            직접 글쓰기
          </Link>
          <Link href="/ai-writing" className="primary-link">
            ✦ AI 글쓰기
          </Link>
        </div>
      </div>

      <section
        className="dashboard-metrics"
        aria-label="게시글 요약"
        aria-busy={!posts.ready}
      >
        {metrics.map(({ key, label, href }) => (
          <Link className="metric-card" key={key} href={href}>
            <p>{label}</p>
            <strong>
              {posts.data?.counts[key] ?? "—"}
              {posts.data && <small>개</small>}
            </strong>
            <span>목록 보기 →</span>
          </Link>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="posts-panel" aria-labelledby="recent-posts-title">
          <div className="section-toolbar">
            <h2 id="recent-posts-title">최근 수정한 글</h2>
            <Link href="/posts">전체 보기 →</Link>
          </div>
          {!posts.ready ? (
            <div className="list-message" role="status">
              게시글 현황을 불러오는 중이에요.
            </div>
          ) : posts.error ? (
            <div className="list-message" role="alert">
              <p>게시글 현황을 불러오지 못했어요.</p>
              <p>{posts.error}</p>
              <button
                className="outline-button"
                type="button"
                onClick={posts.reload}
              >
                다시 시도
              </button>
            </div>
          ) : recent.length === 0 ? (
            <div className="list-message">
              <p>아직 작성한 글이 없어요.</p>
              <Link className="outline-button" href="/posts/new">
                첫 글 작성하기
              </Link>
            </div>
          ) : (
            <div
              className="table-scroll"
              role="region"
              aria-label="최근 수정 글 표"
              tabIndex={0}
            >
              <table className="posts-table">
                <caption className="sr-only">제목, 상태, 수정일</caption>
                <thead>
                  <tr>
                    <th scope="col">제목</th>
                    <th scope="col">상태</th>
                    <th scope="col">수정일</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <Link
                          className="post-title"
                          href={`/posts/${post.id}/edit`}
                        >
                          {post.title}
                        </Link>
                        <p className="field-help">{post.category}</p>
                      </td>
                      <td>
                        <span className={`post-status status-${post.status}`}>
                          {statusLabels[post.status]}
                        </span>
                      </td>
                      <td>
                        <time dateTime={new Date(post.updatedAt).toISOString()}>
                          {dateFormatter.format(post.updatedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className="settings-card"
          aria-labelledby="job-overview-title"
          aria-busy={!posts.ready}
        >
          <div className="section-toolbar">
            <h2 id="job-overview-title">AI 작업 현황</h2>
            <button
              className="outline-button"
              type="button"
              onClick={posts.reload}
              disabled={!posts.ready}
            >
              새로고침
            </button>
          </div>
          {posts.error ? (
            <p className="editor-errors" role="alert">
              AI 작업 현황을 불러오지 못했어요.
            </p>
          ) : !jobs ? (
            <p role="status">AI 작업 현황을 불러오는 중이에요.</p>
          ) : (
            <>
              <div className="job-overview">
                <p>
                  진행 중<strong>{jobs.counts.running}</strong>
                </p>
                <p>
                  검토 대기<strong>{jobs.counts.review}</strong>
                </p>
                <p>
                  실패·응답 없음<strong>{jobs.counts.failed}</strong>
                </p>
              </div>
              <ul className="dashboard-job-list">
                {jobs.recent.map((job) => (
                  <li key={job.id}>
                    {job.status === "review" ? (
                      <Link
                        className="post-title"
                        href={`/posts/${job.id}/edit`}
                      >
                        {job.title}
                      </Link>
                    ) : (
                      <span>{job.title}</span>
                    )}
                    <span
                      className={`job-badge job-${job.status === "unconfirmed" ? "failed" : job.status}`}
                    >
                      {jobLabels[job.status]}
                    </span>
                  </li>
                ))}
              </ul>
              {jobs.recent.length === 0 && <p>표시할 AI 작업이 없어요.</p>}
            </>
          )}
          <Link className="secondary-link" href="/ai-writing">
            AI 글쓰기 →
          </Link>
        </section>
      </div>

      <section className="analytics-placeholder">
        <div>
          <h2>방문 통계</h2>
          <p>방문자 수·인기 글·유입 경로는 통계 수집 연결 후 표시됩니다.</p>
        </div>
        <span className="pill">통계 연결 전</span>
      </section>
    </>
  );
}
