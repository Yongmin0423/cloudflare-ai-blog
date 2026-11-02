export type PostStatus = "draft" | "published" | "private";
export type PostSummary = {
  id: string;
  title: string;
  category: string;
  status: PostStatus;
  origin: "manual" | "ai";
  updatedAt: string;
};

export const statusLabels: Record<PostStatus, string> = {
  draft: "초안", published: "발행", private: "비공개",
};

// UI fixtures only. Replace this source with authenticated D1 queries later.
export const demoPosts: PostSummary[] = [
  { id: "demo-01", title: "작은 기록으로 시작하는 블로그", category: "블로그 운영", status: "draft", origin: "manual", updatedAt: "2026-11-02T09:30:00+09:00" },
  { id: "demo-02", title: "가을 산책길에서 발견한 풍경", category: "일상", status: "published", origin: "manual", updatedAt: "2026-11-01T17:00:00+09:00" },
  { id: "demo-03", title: "아침 시간을 여유롭게 보내는 방법", category: "생활 정보", status: "draft", origin: "ai", updatedAt: "2026-10-31T10:20:00+09:00" },
  { id: "demo-04", title: "첫 번째 여행 기록을 정리하며", category: "일상", status: "private", origin: "manual", updatedAt: "2026-10-30T14:10:00+09:00" },
  { id: "demo-05", title: "독자를 위한 글 제목 작성하기", category: "블로그 운영", status: "published", origin: "ai", updatedAt: "2026-10-29T11:00:00+09:00" },
  { id: "demo-06", title: "책상 위를 정리하는 작은 습관", category: "생활 정보", status: "published", origin: "manual", updatedAt: "2026-10-28T08:00:00+09:00" },
  { id: "demo-07", title: "다음 글을 위한 아이디어 메모", category: "미분류", status: "draft", origin: "manual", updatedAt: "2026-10-27T21:00:00+09:00" },
  { id: "demo-08", title: "오래 읽히는 글의 구성", category: "블로그 운영", status: "private", origin: "ai", updatedAt: "2026-10-26T15:00:00+09:00" },
  { id: "demo-09", title: "주말에 만드는 나만의 독서 시간", category: "일상", status: "published", origin: "manual", updatedAt: "2026-10-25T12:00:00+09:00" },
  { id: "demo-10", title: "계절이 바뀔 때 집안 정리하기", category: "생활 정보", status: "draft", origin: "ai", updatedAt: "2026-10-24T09:00:00+09:00" },
  { id: "demo-11", title: "사진과 함께 남기는 하루", category: "일상", status: "published", origin: "manual", updatedAt: "2026-10-23T16:00:00+09:00" },
  { id: "demo-12", title: "블로그 카테고리를 나누는 기준", category: "블로그 운영", status: "draft", origin: "ai", updatedAt: "2026-10-22T10:00:00+09:00" },
];
