// Subset of the Tiptap JSON contract used by the current free editor extensions.
export type ContentNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: ContentNode[] };
export type BlogPost = { id: string; slug: string; title: string; excerpt: string; categoryId: string; status: "draft" | "published" | "private"; publishedAt: string; updatedAt: string; cover: string; coverAlt: string; content: ContentNode };
export const blog = { name: "기록의 숲", description: "일상에서 발견한 작은 생각과 생활의 이야기를 기록합니다.", author: "기록의 숲 편집실" };
export const categories = [
  { id: "daily", slug: "daily", name: "일상", description: "지나치기 쉬운 순간에 잠시 머물러 봅니다." },
  { id: "life", slug: "life", name: "생활 정보", description: "나에게 맞는 생활의 방식을 찾아가는 기록입니다." },
  { id: "blog", slug: "blogging", name: "블로그 운영", description: "생각을 정리하고 글로 남기는 과정을 나눕니다." },
  { id: "notes", slug: "notes", name: "짧은 메모", description: "아직 긴 글이 되지 않은 작은 생각을 모읍니다." },
];
const p = (text: string): ContentNode => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string): ContentNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const list = (type: "bulletList" | "orderedList", lines: string[]): ContentNode => ({ type, content: lines.map((line) => ({ type: "listItem", content: [p(line)] })) });
const everydayContent = (title: string): ContentNode => ({ type: "doc", content: [
  p("이 글은 공개 블로그 화면을 확인하기 위한 샘플 콘텐츠입니다. 일상에서 발견한 장면을 글로 옮기는 모습을 담았습니다."),
  h(2, title), p("별다른 일이 없는 날에도 기록할 장면은 있습니다. 창가에 놓인 책, 평소와 달랐던 하늘빛, 잠깐 떠올랐던 생각을 적어봅니다."),
  h(3, "한 장면부터 적어보기"), p("하루 전체를 설명하려고 하기보다 기억에 남은 장면 하나를 골라봅니다. 그때 보았던 것과 느꼈던 것을 내 말로 남깁니다."),
  { type: "blockquote", content: [p("완성된 이야기보다, 오늘 남긴 한 문장에서 시작합니다.")] },
  list("bulletList", ["오늘의 장면을 한 문장으로 적기", "다시 읽고 싶은 생각을 표시하기", "다음 이야기를 위한 여백 남기기"]),
  h(2, "기록을 이어가는 마음"), p("글의 길이나 모양은 조금씩 달라도 괜찮습니다. 나에게 편안한 방식으로 기록을 이어가 보려고 합니다."),
] });
const writingContent: ContentNode = { type: "doc", content: [
  p("빈 문서를 열고 나면 무엇부터 써야 할지 잠깐 망설이게 됩니다. 오늘은 첫 문장을 완벽하게 쓰려는 마음을 내려놓고 작은 장면부터 적어보았습니다."),
  h(2, "크고 멋진 이야기보다 작은 관찰"),
  { type: "paragraph", content: [{ type: "text", text: "기록의 출발점은 ", }, { type: "text", text: "내가 직접 본 것", marks: [{ type: "bold" }] }, { type: "text", text: "입니다. 창문을 열었을 때의 공기나 책 속에서 마음에 남은 문장을 떠올려봅니다." }] },
  h(3, "오늘의 기록을 시작하는 세 가지 질문"),
  list("orderedList", ["오늘 가장 오래 바라본 것은 무엇인가요?", "다시 떠올리고 싶은 순간이 있었나요?", "내일의 나에게 남기고 싶은 말은 무엇인가요?"]),
  { type: "blockquote", content: [p("한 문장이라도 내 언어로 남겨두면, 오늘은 조금 더 선명해집니다.")] },
  h(2, "글의 모양을 다듬는 시간"),
  { type: "paragraph", content: [{ type: "text", text: "먼저 생각을 적고, ", marks: [{ type: "italic" }] }, { type: "text", text: "나중에 문장의 순서를 정리합니다. ", marks: [{ type: "bold" }, { type: "italic" }] }, { type: "text", text: "처음부터 완벽하게 쓰기", marks: [{ type: "strike" }] }] },
  { type: "image", attrs: { src: "/images/writing.svg", alt: "노트와 잎사귀가 놓인 책상 일러스트" } },
  { type: "paragraph", content: [{ type: "text", text: "관련 글: " }, { type: "text", text: "블로그 카테고리를 나누는 기준", marks: [{ type: "link", attrs: { href: "/posts/organizing-categories" } }] }] },
  { type: "horizontalRule" },
  { type: "paragraph", content: [{ type: "text", text: "오늘의 메모" }, { type: "hardBreak" }, { type: "text", text: "오래 남는 글은 작은 기록에서 시작될지도 모르겠습니다." }] },
] };
function post(id: string, slug: string, title: string, excerpt: string, categoryId: string, date: string, cover: string, content = everydayContent(title)): BlogPost {
  return { id, slug, title, excerpt, categoryId, status: "published", publishedAt: `${date}T09:00:00+09:00`, updatedAt: `${date}T09:00:00+09:00`, cover: `/images/${cover}.svg`, coverAlt: cover === "walk" ? "나무와 산책길 일러스트" : cover === "home" ? "햇빛이 드는 창가와 화분 일러스트" : "노트와 잎사귀가 놓인 책상 일러스트", content };
}
// Public UI fixtures only. No admin localStorage data or private API is read here.
const posts: BlogPost[] = [
  post("1", "small-records", "작은 기록이 쌓여, 나만의 이야기가 되기까지", "완벽한 첫 문장 대신 오늘의 장면 하나. 부담 없이 기록을 시작하는 마음에 관하여.", "blog", "2026-11-02", "writing", writingContent),
  post("2", "autumn-walk", "익숙한 산책길에서 발견한 새로운 풍경", "늘 걷던 길을 조금 천천히 걸었습니다. 그동안 지나쳤던 계절의 표정이 눈에 들어왔습니다.", "daily", "2026-11-01", "walk"),
  post("3", "quiet-morning", "조금 느리게 시작하는 아침의 기록", "창가의 빛과 따뜻한 차 한 잔. 분주한 하루를 시작하기 전의 짧은 시간을 남깁니다.", "life", "2026-10-31", "home"),
  post("4", "organizing-categories", "블로그 카테고리를 나누는 나만의 기준", "쓰고 싶은 이야기를 몇 가지 주제로 묶어보았습니다. 글이 쌓이며 분류도 조금씩 달라집니다.", "blog", "2026-10-30", "writing"),
  post("5", "weekend-reading", "주말 오후, 책 한 권을 곁에 두고", "책장을 넘기다가 멈춘 순간들. 다 읽는 것보다 오래 생각한 문장이 남았습니다.", "daily", "2026-10-29", "home"),
  post("6", "room-for-thought", "책상 위에 작은 여백을 만들었습니다", "물건을 옮기고 노트를 펼쳤습니다. 나에게 편안한 공간을 만들어가는 소소한 이야기입니다.", "life", "2026-10-28", "writing"),
  post("7", "seasonal-notes", "계절의 끝에서 다시 펼쳐본 메모", "짧게 남긴 문장 속에는 그날의 풍경이 있었습니다. 지난 기록을 다시 읽으며 떠올린 생각들.", "daily", "2026-10-27", "walk"),
  { ...post("draft", "unpublished-draft", "공개되면 안 되는 초안", "", "daily", "2026-11-02", "walk"), status: "draft" },
  { ...post("private", "private-note", "공개되면 안 되는 비공개 글", "", "daily", "2026-11-02", "walk"), status: "private" },
];
export function publishedPosts(categoryId?: string): BlogPost[] {
  return posts.filter((item) => item.status === "published" && (!categoryId || item.categoryId === categoryId)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
export function publishedPost(slug: string) { return publishedPosts().find((item) => item.slug === slug); }
export function categoryBySlug(slug: string) { return categories.find((item) => item.slug === slug); }
export const PAGE_SIZE = 4;
export function readPage(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value); return Number.isSafeInteger(page) ? page : null;
}
export function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value)); }
