export type Category = { id: string; name: string; slug: string; description: string; order: number };
export const initialCategories: Category[] = [
  { id: "blog", name: "블로그 운영", slug: "blogging", description: "블로그를 만들고 운영하는 이야기", order: 1 },
  { id: "life", name: "생활 정보", slug: "life", description: "생활에 도움이 되는 정보", order: 2 },
  { id: "daily", name: "일상", slug: "daily", description: "일상과 기록", order: 3 },
];
export const categoryPostCounts: Record<string, number> = { blog: 4, life: 3, daily: 4 };
export const categoriesKey = "blog-studio:categories:v1";
export const settingsKey = "blog-studio:settings:v1";
export type BlogSettings = { name: string; description: string; language: string; topic: string; audience: string; tone: string; rules: string; avoid: string };
export const initialSettings: BlogSettings = { name: "나의 블로그", description: "", language: "ko", topic: "", audience: "", tone: "친절하고 이해하기 쉬운 말투", rules: "", avoid: "" };
export function categoryErrors(category: Category, all: Category[]): string[] {
  const errors: string[] = [];
  if (!category.name.trim() || category.name.trim().length > 40) errors.push("이름은 1~40자로 입력해 주세요.");
  if (category.name.trim() === "미분류") errors.push("미분류는 기본 분류로 사용하므로 다른 이름을 입력해 주세요.");
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(category.slug) || category.slug.length > 100) errors.push("슬러그는 100자 이내 한글·영문·숫자와 단어 사이 하이픈으로 입력해 주세요.");
  if (category.description.length > 300) errors.push("설명은 300자 이내로 입력해 주세요.");
  if (!Number.isInteger(category.order) || category.order < 1 || category.order > 999) errors.push("표시 순서는 1~999의 정수로 입력해 주세요.");
  const others = all.filter((item) => item.id !== category.id);
  if (others.some((item) => item.name.trim().toLocaleLowerCase() === category.name.trim().toLocaleLowerCase())) errors.push("이미 사용 중인 카테고리 이름입니다.");
  if (others.some((item) => item.slug.toLocaleLowerCase() === category.slug.toLocaleLowerCase())) errors.push("이미 사용 중인 슬러그입니다.");
  return errors;
}
export function settingsErrors(settings: BlogSettings): string[] {
  const errors: string[] = [];
  if (!settings.name.trim() || settings.name.length > 80) errors.push("블로그 이름은 1~80자로 입력해 주세요.");
  if (settings.description.length > 300) errors.push("소개는 300자 이내로 입력해 주세요.");
  if (!["ko", "en", "ja"].includes(settings.language)) errors.push("지원하는 언어를 선택해 주세요.");
  if ([settings.topic, settings.audience, settings.tone].some((value) => value.length > 300)) errors.push("주제·대상 독자·말투는 각각 300자 이내로 입력해 주세요.");
  if ([settings.rules, settings.avoid].some((value) => value.length > 3000)) errors.push("작성 규칙·피해야 할 표현은 각각 3,000자 이내로 입력해 주세요.");
  return errors;
}
export function parseCategories(raw: string): Category[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 100 || !data.every((item) => item && typeof item.id === "string" && item.id.length > 0 && [item.name, item.slug, item.description].every((value) => typeof value === "string") && typeof item.order === "number")) throw new Error("카테고리 저장본을 읽을 수 없어요.");
  const categories = data as Category[];
  if (new Set(categories.map((item) => item.id)).size !== categories.length || categories.some((item) => categoryErrors(item, categories).length)) throw new Error("카테고리 저장본이 올바르지 않아요.");
  return categories;
}
export function parseSettings(raw: string): BlogSettings {
  const data = JSON.parse(raw) as BlogSettings;
  if (!data || Object.keys(initialSettings).some((key) => typeof data[key as keyof BlogSettings] !== "string") || settingsErrors(data).length) throw new Error("설정 저장본을 읽을 수 없어요.");
  return data;
}
