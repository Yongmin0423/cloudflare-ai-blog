import type { D1Database } from "@cloudflare/workers-types";
import { categoryInputSchema, settingsSchema, type BlogSettings, type CategoryInput, type CategoryRecord, type SettingsResponse } from "@cloudflare-ai-blog/shared";
// Imported only by server adapters. Runtime types are explicit package dependencies.
type Database = Pick<D1Database, "prepare" | "batch">;
export class ManagementError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function translate(error: unknown): never {
  if (error instanceof ManagementError) throw error;
  const details = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
  if (/UNIQUE constraint/i.test(details)) throw new ManagementError(409, "이미 사용 중인 이름 또는 슬러그예요.");
  if (/FOREIGN KEY constraint/i.test(details)) throw new ManagementError(409, "연결된 글이 있어 변경할 수 없어요. 목록을 새로 확인해 주세요.");
  throw error;
}
export async function getSettings(db: Database, blogId: string): Promise<SettingsResponse> {
  const row = await db.prepare(`SELECT b.name, b.description, b.language, b.updated_at AS updatedAt,
    coalesce(s.topic,'') AS topic, coalesce(s.audience,'') AS audience, coalesce(s.tone,'') AS tone,
    coalesce(s.rules,'') AS rules, coalesce(s.avoid_expressions,'') AS avoid
    FROM blogs b LEFT JOIN blog_writing_settings s ON s.blog_id=b.id WHERE b.id=?`).bind(blogId).first<BlogSettings & { updatedAt: number }>();
  if (!row) throw new ManagementError(404, "블로그가 없어요. 로컬 초기 데이터를 먼저 준비해 주세요.");
  const { updatedAt, ...settings } = row;
  return { settings: settingsSchema.parse(settings), updatedAt };
}
export async function saveSettings(db: Database, blogId: string, input: BlogSettings, expected: number) {
  const settings = settingsSchema.parse(input);
  const now = Math.max(Date.now(), expected + 1);
  // Both statements share one atomic D1 batch. Guard BOTH by the same version.
  // Write settings first so the blog's old version remains visible to its guard.
  const result = await db.batch([
    db.prepare(`INSERT INTO blog_writing_settings(blog_id,topic,audience,tone,rules,avoid_expressions,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM blogs WHERE id=? AND updated_at=?)
      ON CONFLICT(blog_id) DO UPDATE SET topic=excluded.topic,audience=excluded.audience,tone=excluded.tone,rules=excluded.rules,avoid_expressions=excluded.avoid_expressions,updated_at=excluded.updated_at`)
      .bind(blogId,settings.topic,settings.audience,settings.tone,settings.rules,settings.avoid,now,blogId,expected),
    db.prepare("UPDATE blogs SET name=?,description=?,language=?,updated_at=? WHERE id=? AND updated_at=?")
      .bind(settings.name,settings.description,settings.language,now,blogId,expected),
  ]);
  if (result[1].meta.changes !== 1) throw new ManagementError(409, "다른 화면에서 설정이 변경됐어요. 새로고침 후 다시 저장해 주세요.");
  return getSettings(db,blogId);
}
export async function listCategories(db: Database, blogId: string): Promise<CategoryRecord[]> {
  const { results } = await db.prepare(`SELECT c.id,c.name,c.slug,c.description,c.sort_order AS "order",c.updated_at AS updatedAt,
    (SELECT count(*) FROM posts p WHERE p.blog_id=c.blog_id AND p.category_id=c.id) AS postCount
    FROM categories c WHERE c.blog_id=? ORDER BY c.sort_order,c.name,c.id`).bind(blogId).all<CategoryRecord>();
  return results;
}
export async function createCategory(db: Database, blogId: string, input: CategoryInput) {
  const category = categoryInputSchema.parse(input); const now = Date.now(); const id = crypto.randomUUID();
  try {
    const result = await db.prepare(`INSERT INTO categories(id,blog_id,name,slug,description,sort_order,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM categories WHERE blog_id=?)<100`)
      .bind(id,blogId,category.name,category.slug,category.description,category.order,now,now,blogId).run();
    if (result.meta.changes !== 1) throw new ManagementError(409,"카테고리는 최대 100개까지 만들 수 있어요.");
  } catch (error) { translate(error); }
  return listCategories(db,blogId);
}
export async function updateCategory(db: Database, blogId: string, id: string, input: CategoryInput, expected: number) {
  const category=categoryInputSchema.parse(input); const now=Math.max(Date.now(),expected+1);
  try {
    const result = await db.prepare("UPDATE categories SET name=?,slug=?,description=?,sort_order=?,updated_at=? WHERE blog_id=? AND id=? AND updated_at=?")
      .bind(category.name,category.slug,category.description,category.order,now,blogId,id,expected).run();
    if (result.meta.changes !== 1) throw new ManagementError(409,"다른 화면에서 변경되었거나 삭제된 분류예요. 목록을 새로고침해 주세요.");
  } catch (error) { translate(error); }
  return listCategories(db,blogId);
}
export async function deleteCategory(db: Database, blogId: string, id: string, expected: number) {
  try {
    const result = await db.prepare(`DELETE FROM categories WHERE blog_id=? AND id=? AND updated_at=?
      AND NOT EXISTS(SELECT 1 FROM posts WHERE blog_id=? AND category_id=?)`).bind(blogId,id,expected,blogId,id).run();
    if (result.meta.changes !== 1) throw new ManagementError(409,"연결된 글이 있거나 분류가 변경됐어요. 목록을 새로고침해 주세요.");
  } catch (error) { translate(error); }
  return listCategories(db,blogId);
}
