import type { D1Database } from "@cloudflare/workers-types";
import { postInputSchema, postDetailSchema, type PostInput, type PostListQuery } from "@cloudflare-ai-blog/shared";
import { ManagementError } from "./management";
type Database = Pick<D1Database,"prepare"|"batch">;
function translate(error: unknown): never {
  const details = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
  if (/UNIQUE constraint/i.test(details)) throw new ManagementError(409,"이미 사용 중인 게시글 슬러그예요. 목록에서 저장 여부를 확인하거나 다른 슬러그를 입력해 주세요.");
  if (/FOREIGN KEY constraint/i.test(details)) throw new ManagementError(409,"카테고리가 삭제되었거나 이 블로그의 카테고리가 아니에요.");
  throw error;
}
export async function getPost(db:Database,blogId:string,id:string) {
  const row = await db.prepare(`SELECT p.id,p.title,p.slug,p.category_id AS categoryId,p.content_json,p.cover_url AS coverUrl,p.cover_alt AS coverAlt,
    p.status,p.origin,p.revision,p.updated_at AS updatedAt,coalesce(s.meta_title,'') AS seoTitle,coalesce(s.description,'') AS seoDescription
    FROM posts p LEFT JOIN post_seo s ON s.blog_id=p.blog_id AND s.post_id=p.id WHERE p.blog_id=? AND p.id=?`).bind(blogId,id).first<Record<string,unknown>>();
  if (!row) throw new ManagementError(404,"게시글을 찾을 수 없어요.");
  const {content_json,...fields}=row;
  return postDetailSchema.parse({...fields,content:JSON.parse(String(content_json))});
}
function excerpt(post:PostInput) {
  const texts:string[]=[];
  function walk(node:PostInput["content"]) { if(node.text)texts.push(node.text);node.content?.forEach(n=>walk(n as PostInput["content"])); }
  walk(post.content);return texts.join(" ").slice(0,500);
}
export async function createPost(db:Database,blogId:string,input:PostInput) {
  const post=postInputSchema.parse(input);const id=crypto.randomUUID();const now=Date.now();
  try { await db.batch([
    db.prepare(`INSERT INTO posts(id,blog_id,category_id,title,slug,content_json,excerpt,cover_url,cover_alt,created_at,updated_at,content_updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,blogId,post.categoryId,post.title,post.slug,JSON.stringify(post.content),excerpt(post),post.coverUrl,post.coverAlt,now,now,now),
    db.prepare(`INSERT INTO post_seo(post_id,blog_id,meta_title,title_source,description,description_source,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(id,blogId,post.seoTitle||null,post.seoTitle?"manual":"auto",post.seoDescription||null,post.seoDescription?"manual":"auto",now),
  ]); } catch(error) {translate(error);}
  return getPost(db,blogId,id);
}
export async function updatePost(db:Database,blogId:string,id:string,input:PostInput,expected:number) {
  const post=postInputSchema.parse(input);const now=Date.now();const content=JSON.stringify(post.content);
  try { const result=await db.batch([
    db.prepare(`INSERT INTO post_seo(post_id,blog_id,meta_title,title_source,description,description_source,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE blog_id=? AND id=? AND revision=? AND status IN ('draft','private'))
      ON CONFLICT(post_id) DO UPDATE SET meta_title=excluded.meta_title,title_source=excluded.title_source,description=excluded.description,description_source=excluded.description_source,updated_at=excluded.updated_at`)
      .bind(id,blogId,post.seoTitle||null,post.seoTitle?"manual":"auto",post.seoDescription||null,post.seoDescription?"manual":"auto",now,blogId,id,expected),
    db.prepare(`UPDATE posts SET category_id=?,title=?,slug=?,content_json=?,excerpt=?,cover_url=?,cover_alt=?,revision=revision+1,updated_at=max(updated_at+1,?),
      content_updated_at=CASE WHEN title<>? OR content_json<>? THEN max(content_updated_at+1,?) ELSE content_updated_at END
      WHERE blog_id=? AND id=? AND revision=? AND status IN ('draft','private')`)
      .bind(post.categoryId,post.title,post.slug,content,excerpt(post),post.coverUrl,post.coverAlt,now,post.title,content,now,blogId,id,expected),
  ]);if(result[1].meta.changes!==1)throw new ManagementError(409,"다른 화면에서 수정되었거나 편집할 수 없는 글이에요. 입력 내용은 유지됩니다. 다른 탭에서 최신 저장본을 확인해 주세요.");
  } catch(error) {translate(error);}
  return getPost(db,blogId,id);
}
export async function listPosts(db:Database,blogId:string,query:PostListQuery) {
  const conditions=["p.blog_id=?"];const values:(string|number)[]=[blogId];
  if(query.q){conditions.push("instr(lower(p.title),lower(?))>0");values.push(query.q);}
  if(query.status!=="all"){conditions.push("p.status=?");values.push(query.status);}
  if(query.category==="uncategorized")conditions.push("p.category_id IS NULL");
  else if(query.category!=="all"){conditions.push("p.category_id=?");values.push(query.category);}
  const where=conditions.join(" AND ");
  const count=await db.prepare(`SELECT count(*) AS total FROM posts p WHERE ${where}`).bind(...values).first<{total:number}>();
  const total=count?.total??0;const pageSize=5;const page=Math.min(query.page,Math.max(1,Math.ceil(total/pageSize)));
  const {results:posts}=await db.prepare(`SELECT p.id,p.title,p.slug,p.category_id AS categoryId,coalesce(c.name,'미분류') AS category,p.status,p.origin,p.revision,p.updated_at AS updatedAt
    FROM posts p LEFT JOIN categories c ON c.blog_id=p.blog_id AND c.id=p.category_id WHERE ${where} ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`)
    .bind(...values,pageSize,(page-1)*pageSize).all();
  return {posts,total,page,pageSize};
}
