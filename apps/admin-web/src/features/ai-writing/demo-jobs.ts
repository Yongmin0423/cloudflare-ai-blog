export const jobStages = ["본문 작성", "SEO 분석", "이미지", "내부 링크", "QA 검증"];
export type JobStatus = "queued" | "running" | "review" | "failed" | "completed";
export type DemoJob = { id: string; keyword: string; category: string; instructions: string; status: JobStatus; step: number; createdAt: string };
export const jobLabels: Record<JobStatus, string> = { queued: "대기", running: "진행 중", review: "검토 대기", failed: "실패", completed: "검토 완료" };
export const jobsKey = "blog-studio:demo-jobs:v1";
export const initialJobs: DemoJob[] = [
  { id: "sample-review", keyword: "아침 시간 활용", category: "생활 정보", instructions: "", status: "review", step: 5, createdAt: "2026-11-03T09:00:00+09:00" },
  { id: "sample-running", keyword: "블로그 기록 습관", category: "블로그 운영", instructions: "", status: "running", step: 1, createdAt: "2026-11-03T08:50:00+09:00" },
  { id: "sample-failed", keyword: "가을 산책", category: "일상", instructions: "", status: "failed", step: 4, createdAt: "2026-11-03T08:40:00+09:00" },
];
export function requestErrors(keyword: string, instructions: string): string[] {
  const errors: string[] = [];
  if (!keyword.trim() || keyword.trim().length > 100) errors.push("키워드는 1~100자로 입력해 주세요.");
  if (instructions.length > 2000) errors.push("추가 지시는 2,000자 이내로 입력해 주세요.");
  return errors;
}
export function advanceJob(job: DemoJob): DemoJob {
  if (job.status === "queued") return { ...job, status: "running" };
  if (job.status !== "running") return job;
  const step = Math.min(jobStages.length, job.step + 1);
  return { ...job, step, status: step === jobStages.length ? "review" : "running" };
}
export function retryJob(job: DemoJob): DemoJob { return job.status === "failed" ? { ...job, status: "running" } : job; }
export function parseJobs(raw: string): DemoJob[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 100 || !value.every((item) => item && typeof item.id === "string" && item.id.length && typeof item.keyword === "string" && typeof item.instructions === "string" && typeof item.category === "string" && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) && Object.hasOwn(jobLabels, item.status) && Number.isInteger(item.step) && item.step >= 0 && item.step <= 5 && requestErrors(item.keyword, item.instructions).length === 0 && (["review", "completed"].includes(item.status) ? item.step === 5 : item.step < 5))) throw new Error("작업 샘플 저장본을 읽을 수 없어요.");
  if (new Set(value.map((item) => item.id)).size !== value.length) throw new Error("작업 ID가 중복됩니다.");
  return value as DemoJob[];
}
