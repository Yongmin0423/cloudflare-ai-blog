import type { D1Database } from "@cloudflare/workers-types";
import {
  postInputSchema,
  postDetailSchema,
  postPublicationResponseSchema,
  type PostInput,
  type PostListQuery,
  type EditorNode,
  type PostPublication,
} from "@cloudflare-ai-blog/shared";
import { ManagementError } from "./management";
type Database = Pick<D1Database, "prepare" | "batch">;
function translate(error: unknown): never {
  const details =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : "";
  if (/UNIQUE constraint/i.test(details))
    throw new ManagementError(
      409,
      "이미 사용 중인 게시글 슬러그예요. 목록에서 저장 여부를 확인하거나 다른 슬러그를 입력해 주세요.",
    );
  if (/FOREIGN KEY constraint/i.test(details))
    throw new ManagementError(
      409,
      "카테고리가 삭제되었거나 이 블로그의 카테고리가 아니에요.",
    );
  throw error;
}
export async function getPost(db: Database, blogId: string, id: string) {
  const row = await db
    .prepare(
      `SELECT p.id,p.title,p.slug,p.category_id AS categoryId,p.content_json,p.cover_url AS coverUrl,
    c.media_id AS coverMediaId,coalesce(c.alt,p.cover_alt) AS coverAlt,
    p.status,p.origin,p.revision,p.published_at AS publishedAt,p.updated_at AS updatedAt,
    coalesce(s.meta_title,'') AS seoTitle,coalesce(s.description,'') AS seoDescription
    FROM posts p LEFT JOIN post_seo s ON s.blog_id=p.blog_id AND s.post_id=p.id
    LEFT JOIN post_media c ON c.blog_id=p.blog_id AND c.post_id=p.id AND c.usage='cover'
    WHERE p.blog_id=? AND p.id=?`,
    )
    .bind(blogId, id)
    .first<Record<string, unknown>>();
  if (!row) throw new ManagementError(404, "게시글을 찾을 수 없어요.");
  const { content_json, ...fields } = row;
  return postDetailSchema.parse({
    ...fields,
    content: JSON.parse(String(content_json)),
  });
}
function excerpt(post: PostInput) {
  const texts: string[] = [];
  function walk(node: PostInput["content"]) {
    if (node.text) texts.push(node.text);
    node.content?.forEach((n) => walk(n as PostInput["content"]));
  }
  walk(post.content);
  return texts.join(" ").slice(0, 500);
}
async function checkCoverMedia(
  db: Database,
  blogId: string,
  mediaId: PostInput["coverMediaId"],
) {
  if (!mediaId) return;
  const media = await db
    .prepare("SELECT 1 FROM media WHERE blog_id=? AND id=?")
    .bind(blogId, mediaId)
    .first();
  if (!media)
    throw new ManagementError(
      400,
      "이 블로그에 업로드된 대표 이미지를 찾을 수 없어요.",
    );
}
export async function createPost(
  db: Database,
  blogId: string,
  input: PostInput,
) {
  const post = postInputSchema.parse(input);
  const id = crypto.randomUUID();
  const now = Date.now();
  await checkCoverMedia(db, blogId, post.coverMediaId);
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO posts(id,blog_id,category_id,title,slug,content_json,excerpt,cover_url,cover_alt,created_at,updated_at,content_updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          blogId,
          post.categoryId,
          post.title,
          post.slug,
          JSON.stringify(post.content),
          excerpt(post),
          post.coverUrl,
          post.coverMediaId ? "" : post.coverAlt,
          now,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO post_seo(post_id,blog_id,meta_title,title_source,description,description_source,updated_at) VALUES(?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          blogId,
          post.seoTitle || null,
          post.seoTitle ? "manual" : "auto",
          post.seoDescription || null,
          post.seoDescription ? "manual" : "auto",
          now,
        ),
      ...(post.coverMediaId
        ? [
            db
              .prepare(
                "INSERT INTO post_media(post_id,media_id,blog_id,usage,alt,position) VALUES(?,?,?,'cover',?,0)",
              )
              .bind(id, post.coverMediaId, blogId, post.coverAlt),
          ]
        : []),
    ]);
  } catch (error) {
    translate(error);
  }
  return getPost(db, blogId, id);
}
export async function updatePost(
  db: Database,
  blogId: string,
  id: string,
  input: PostInput,
  expected: number,
) {
  const post = postInputSchema.parse(input);
  const now = Date.now();
  const content = JSON.stringify(post.content);
  await checkCoverMedia(db, blogId, post.coverMediaId);
  // 대표 이미지 교체도 본문과 같은 revision을 검사한 뒤 같은 D1 배치에서 처리한다.
  // 처음 발행한 글의 슬러그는 비공개로 전환한 뒤에도 유지한다.
  const editableCondition =
    "blog_id=? AND id=? AND revision=? AND status IN ('draft','private') AND (published_at IS NULL OR slug=?)";
  const editablePost = `SELECT 1 FROM posts WHERE ${editableCondition}`;
  const version = [blogId, id, expected, post.slug] as const;
  const coverStatements = [
    db
      .prepare(
        `DELETE FROM post_media WHERE blog_id=? AND post_id=? AND usage='cover' AND EXISTS(${editablePost})`,
      )
      .bind(blogId, id, ...version),
  ];
  if (post.coverMediaId) {
    coverStatements.push(
      db
        .prepare(
          `INSERT INTO post_media(post_id,media_id,blog_id,usage,alt,position)
      SELECT ?,?,?,'cover',?,0 WHERE EXISTS(${editablePost})`,
        )
        .bind(id, post.coverMediaId, blogId, post.coverAlt, ...version),
    );
  }
  try {
    const result = await db.batch([
      ...coverStatements,
      db
        .prepare(
          `INSERT INTO post_seo(post_id,blog_id,meta_title,title_source,description,description_source,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(${editablePost})
      ON CONFLICT(post_id) DO UPDATE SET meta_title=excluded.meta_title,title_source=excluded.title_source,description=excluded.description,description_source=excluded.description_source,updated_at=excluded.updated_at`,
        )
        .bind(
          id,
          blogId,
          post.seoTitle || null,
          post.seoTitle ? "manual" : "auto",
          post.seoDescription || null,
          post.seoDescription ? "manual" : "auto",
          now,
          ...version,
        ),
      db
        .prepare(
          `UPDATE posts SET category_id=?,title=?,slug=?,content_json=?,excerpt=?,cover_url=?,cover_alt=?,revision=revision+1,updated_at=max(updated_at+1,?),
      content_updated_at=CASE WHEN title<>? OR content_json<>? THEN max(content_updated_at+1,?) ELSE content_updated_at END
      WHERE ${editableCondition}`,
        )
        .bind(
          post.categoryId,
          post.title,
          post.slug,
          content,
          excerpt(post),
          post.coverUrl,
          post.coverMediaId ? "" : post.coverAlt,
          now,
          post.title,
          content,
          now,
          ...version,
        ),
    ]);
    if (result.at(-1)?.meta.changes !== 1)
      throw new ManagementError(
        409,
        "글이 변경되었거나 편집할 수 없어요. 최신 저장본을 확인해 주세요. 발행 이력이 있는 글의 주소는 변경할 수 없어요.",
      );
  } catch (error) {
    translate(error);
  }
  return getPost(db, blogId, id);
}
function hasPublishableContent(node: EditorNode): boolean {
  return (
    node.type === "image" ||
    !!node.text?.trim() ||
    (node.content?.some(hasPublishableContent) ?? false)
  );
}

export async function setPostPublication(
  db: Database,
  blogId: string,
  id: string,
  { status, expectedRevision }: PostPublication,
) {
  const current = await getPost(db, blogId, id);
  const conflict = () =>
    new ManagementError(
      409,
      "다른 화면에서 글이 변경됐어요. 최신 저장본을 확인한 뒤 다시 시도해 주세요.",
    );
  if (current.revision !== expectedRevision) throw conflict();

  if (status === "published") {
    if (current.status === "published")
      throw new ManagementError(409, "이미 발행 상태인 글이에요.");
    if (current.origin === "ai")
      throw new ManagementError(
        409,
        "AI 글은 검수 흐름을 거쳐야 발행할 수 있어요.",
      );
    if (!hasPublishableContent(current.content)) {
      throw new ManagementError(
        400,
        "본문에 글이나 이미지를 추가하고 저장한 뒤 발행해 주세요.",
      );
    }
  } else if (current.status !== "published") {
    throw new ManagementError(
      409,
      "발행 상태인 글만 비공개로 전환할 수 있어요.",
    );
  }

  const now = Date.now();
  // 확인한 버전과 상태가 그대로일 때만 갱신한다. 비공개 전환이나 재발행 시 최초 발행일은 보존한다.
  const result = await db
    .prepare(
      `UPDATE posts SET status=?,
    published_at=CASE WHEN ?='published' THEN coalesce(published_at,max(created_at,?)) ELSE published_at END,
    revision=revision+1,updated_at=max(updated_at+1,?)
    WHERE blog_id=? AND id=? AND revision=? AND status=?
    RETURNING status,revision,published_at AS publishedAt`,
    )
    .bind(
      status,
      status,
      now,
      now,
      blogId,
      id,
      expectedRevision,
      current.status,
    )
    .first();
  if (!result) throw conflict();
  return postPublicationResponseSchema.parse(result);
}

export async function listPosts(
  db: Database,
  blogId: string,
  query: PostListQuery,
) {
  const conditions = ["p.blog_id=?"];
  const values: (string | number)[] = [blogId];
  if (query.q) {
    conditions.push("instr(lower(p.title),lower(?))>0");
    values.push(query.q);
  }
  if (query.status !== "all") {
    conditions.push("p.status=?");
    values.push(query.status);
  }
  if (query.category === "uncategorized")
    conditions.push("p.category_id IS NULL");
  else if (query.category !== "all") {
    conditions.push("p.category_id=?");
    values.push(query.category);
  }
  const where = conditions.join(" AND ");
  const count = await db
    .prepare(`SELECT count(*) AS total FROM posts p WHERE ${where}`)
    .bind(...values)
    .first<{ total: number }>();
  const total = count?.total ?? 0;
  const pageSize = 5;
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
  const { results: posts } = await db
    .prepare(
      `SELECT p.id,p.title,p.slug,p.category_id AS categoryId,coalesce(c.name,'미분류') AS category,p.status,p.origin,p.revision,p.updated_at AS updatedAt
    FROM posts p LEFT JOIN categories c ON c.blog_id=p.blog_id AND c.id=p.category_id WHERE ${where} ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...values, pageSize, (page - 1) * pageSize)
    .all();
  return { posts, total, page, pageSize };
}
