import {
  getAiDraftDiagnostics,
  listAiDraftJobs,
} from "@cloudflare-ai-blog/database";
import type { AiDraftDiagnosticEvent } from "@cloudflare-ai-blog/shared";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdministrator } from "@/lib/auth";

const statusLabels = {
  running: "진행 중",
  succeeded: "초안 저장",
  failed: "실패",
};
const stageLabels: Record<AiDraftDiagnosticEvent["stage"], string> = {
  start: "사용 모델",
  source: "출처",
  outline: "목차",
  body: "본문",
  check: "본문 검증",
  save: "저장 준비·결과",
};
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

export default async function AiDraftLogPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string | string[] }>;
}) {
  const admin = await getAdministrator(await headers());
  if (!admin) redirect("/login");
  const { requestId } = await searchParams;
  const jobs = await listAiDraftJobs(admin.db, admin.blogId);
  const id = typeof requestId === "string" ? requestId : jobs[0]?.id;
  const job = id
    ? await getAiDraftDiagnostics(admin.db, admin.blogId, id)
    : null;

  return (
    <>
      <div className="posts-heading">
        <div className="page-heading">
          <h1>AI 생성 로그</h1>
          <p>
            초안을 작성할 때 사용한 모델과 검색, 출처, 검증 결과를 확인하세요.
          </p>
        </div>
        <Link className="outline-button" href="/ai-writing">
          AI 글쓰기
        </Link>
      </div>
      <div className="dashboard-grid">
        <section className="settings-card" aria-labelledby="ai-log-jobs">
          <h2 id="ai-log-jobs">최근 작업</h2>
          {jobs.length === 0 && <p>아직 AI 초안 생성 기록이 없어요.</p>}
          <ul className="dashboard-job-list">
            {jobs.map((item) => (
              <li key={item.id}>
                <div>
                  <Link
                    className="post-title"
                    aria-current={item.id === id ? "page" : undefined}
                    href={`/ai-writing/logs?requestId=${encodeURIComponent(item.id)}`}
                    prefetch={false}
                  >
                    {item.keyword}
                  </Link>
                  <p className="field-help">
                    <time dateTime={new Date(item.updatedAt).toISOString()}>
                      {dateTime.format(item.updatedAt)}
                    </time>
                  </p>
                </div>
                <span className={`job-badge job-${item.status}`}>
                  {statusLabels[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="settings-card" aria-labelledby="ai-log-detail">
          <h2 id="ai-log-detail">{job?.keyword ?? "작업 상세"}</h2>
          {job ? (
            <>
              <p className="field-help break-all">요청 ID {job.id}</p>
              {job.postId && (
                <Link
                  className="secondary-link"
                  href={`/posts/${job.postId}/edit`}
                >
                  게시글 열기 →
                </Link>
              )}
              {job.events.length === 0 ? (
                <p>
                  이 작업의 상세 로그가 없어요. 이전 작업은 생성 결과만 남아
                  있을 수 있어요.
                </p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-4 p-0">
                  {job.events.map((event, index) => (
                    <li
                      key={index}
                      className="flex flex-col gap-1 border-t pt-3"
                    >
                      <p className="field-help">
                        <time dateTime={new Date(event.at).toISOString()}>
                          {dateTime.format(event.at)}
                        </time>{" "}
                        · {stageLabels[event.stage]}
                      </p>
                      <strong className="wrap-anywhere">{event.message}</strong>
                      {event.details?.map((detail, detailIndex) => (
                        <p key={detailIndex} className="wrap-anywhere">
                          {detail}
                        </p>
                      ))}
                      {event.links?.map(({ title, url }, linkIndex) => (
                        <a
                          key={linkIndex}
                          className="secondary-link break-all"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {title} · {url} ↗
                        </a>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p>
              {id
                ? "이 블로그에서 해당 작업을 찾지 못했어요."
                : "작업을 선택하면 여기에 로그가 표시돼요."}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
