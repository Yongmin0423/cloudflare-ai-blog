import type { D1Database } from "@cloudflare/workers-types";
import {
  aiDraftDiagnosticEventSchema,
  type AiDraftDiagnosticEvent,
  type AiJobStatus,
} from "@cloudflare-ai-blog/shared";

type Database = Pick<D1Database, "prepare">;

export async function appendAiDraftDiagnostic(
  db: Database,
  blogId: string,
  requestId: string,
  event: AiDraftDiagnosticEvent,
) {
  const value = aiDraftDiagnosticEventSchema.parse(event);
  await db
    .prepare(
      `UPDATE ai_draft_jobs SET diagnostic_events_json=json_insert(
      CASE WHEN json_array_length(diagnostic_events_json)=24
        THEN json_remove(diagnostic_events_json,'$[0]') ELSE diagnostic_events_json END,
      '$[#]',json(?)
    ) WHERE blog_id=? AND request_id=?`,
    )
    .bind(JSON.stringify(value), blogId, requestId)
    .run();
}

type DraftJob = {
  id: string;
  keyword: string;
  status: "running" | "failed" | "succeeded";
  updatedAt: number;
  postId: string | null;
};

const draftJobFields = `j.request_id AS id,j.keyword,j.status,j.updated_at AS updatedAt,p.id AS postId`;
const draftJobFrom = `FROM ai_draft_jobs j LEFT JOIN posts p ON p.blog_id=j.blog_id AND p.id=j.request_id AND p.origin='ai'`;

export async function listAiDraftJobs(db: Database, blogId: string) {
  const { results } = await db
    .prepare(
      `SELECT ${draftJobFields} ${draftJobFrom} WHERE j.blog_id=? ORDER BY j.updated_at DESC,j.request_id DESC LIMIT 25`,
    )
    .bind(blogId)
    .all<DraftJob>();
  return results;
}

export async function getAiDraftDiagnostics(
  db: Database,
  blogId: string,
  requestId: string,
) {
  const row = await db
    .prepare(
      `SELECT ${draftJobFields},j.diagnostic_events_json AS eventsJson ${draftJobFrom} WHERE j.blog_id=? AND j.request_id=?`,
    )
    .bind(blogId, requestId)
    .first<DraftJob & { eventsJson: string }>();
  if (!row) return null;
  const { eventsJson, ...job } = row;
  const snapshots = aiDraftDiagnosticEventSchema
    .array()
    .safeParse(JSON.parse(eventsJson));
  return { ...job, events: snapshots.success ? snapshots.data : [] };
}

export async function startAiDraftJob(
  db: Database,
  blogId: string,
  requestId: string,
  keyword: string,
) {
  await db
    .prepare(
      `INSERT INTO ai_draft_jobs (blog_id, request_id, keyword, status, updated_at)
      VALUES (?, ?, ?, 'running', ?)
      ON CONFLICT (blog_id, request_id) DO UPDATE SET
        status = excluded.status, keyword = excluded.keyword, updated_at = excluded.updated_at`,
    )
    .bind(blogId, requestId, keyword, Date.now())
    .run();
}

export async function finishAiDraftJob(
  db: Database,
  blogId: string,
  requestId: string,
  status: "failed" | "succeeded",
) {
  await db
    .prepare(
      `UPDATE ai_draft_jobs SET status=?, updated_at=?
      WHERE blog_id=? AND request_id=? AND status='running'`,
    )
    .bind(status, Date.now(), blogId, requestId)
    .run();
}

export async function getAiDraftDashboard(db: Database, blogId: string) {
  const pendingCutoff = Date.now() - 30 * 60 * 1000;
  // Saved posts resolve a job even if the Agent stopped before recording its result.
  const { results } = await db
    .prepare(
      `WITH visible_jobs AS (
        SELECT p.id, p.title, 'review' AS status, p.created_at AS activity_at
        FROM posts p WHERE p.blog_id=? AND p.origin='ai' AND p.status='draft'
        UNION ALL
        SELECT j.request_id, j.keyword,
          CASE WHEN j.status='running' AND j.updated_at<? THEN 'unconfirmed' ELSE j.status END,
          j.updated_at
        FROM ai_draft_jobs j
        WHERE j.blog_id=? AND j.status IN ('running', 'failed')
          AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.blog_id=j.blog_id AND p.id=j.request_id)
      )
      SELECT id,title,status,
        count(CASE WHEN status='running' THEN 1 END) OVER () AS running,
        count(CASE WHEN status='review' THEN 1 END) OVER () AS review,
        count(CASE WHEN status IN ('failed', 'unconfirmed') THEN 1 END) OVER () AS failed
      FROM visible_jobs ORDER BY activity_at DESC,id DESC LIMIT 3`,
    )
    .bind(blogId, pendingCutoff, blogId)
    .all<{
      id: string;
      title: string;
      status: AiJobStatus;
      running: number;
      review: number;
      failed: number;
    }>();
  const { running = 0, review = 0, failed = 0 } = results[0] ?? {};
  return {
    counts: { running, review, failed },
    recent: results.map(({ id, title, status }) => ({ id, title, status })),
  };
}
