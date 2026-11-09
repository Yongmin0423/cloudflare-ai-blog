import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const { postInputSchema, postListQuerySchema } =
  await import("../../shared/src/management.ts");
const { createPost, getPost, updatePost, listPosts, createCategory } =
  await import("../src/management.ts");
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
  sqlite.exec("INSERT INTO blogs(id,name) VALUES('a','A'),('b','B');");
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let bound = [];
      return {
        bind(...values) {
          bound = values;
          return this;
        },
        async first() {
          return stmt.get(...bound) ?? null;
        },
        async all() {
          return { results: stmt.all(...bound) };
        },
        async run() {
          return { meta: { changes: Number(stmt.run(...bound).changes) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const stmt of statements) result.push(await stmt.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}
const input = {
  title: "저장할 글",
  slug: "saved-post",
  categoryId: null,
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "본문입니다." }] },
    ],
  },
  coverUrl: "https://example.com/cover.png",
  coverAlt: "대표 그림",
  seoTitle: "검색 제목",
  seoDescription: "검색 설명",
};
test("post contracts reject status/ownership injection, unsafe links and malformed/deep/oversized content", () => {
  assert.equal(
    postInputSchema.safeParse({ ...input, status: "published" }).success,
    false,
  );
  assert.equal(
    postInputSchema.safeParse({ ...input, blogId: "b" }).success,
    false,
  );
  for (const content of [
    { type: "doc", content: [{ type: "text", text: "bad" }] },
    {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } },
      ],
    },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:x" } }],
            },
          ],
        },
      ],
    },
  ])
    assert.equal(
      postInputSchema.safeParse({ ...input, content }).success,
      false,
    );
  let nested = { type: "paragraph" };
  for (let n = 0; n < 40; n++)
    nested = { type: "blockquote", content: [nested] };
  assert.equal(
    postInputSchema.safeParse({
      ...input,
      content: { type: "doc", content: [nested] },
    }).success,
    false,
  );
  assert.equal(
    postInputSchema.safeParse({
      ...input,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "가".repeat(70000) }],
          },
        ],
      },
    }).success,
    false,
  );
  assert.equal(
    postInputSchema.safeParse({ ...input, coverAlt: "" }).success,
    false,
  );
});
test("post, JSON body, cover and manual SEO roundtrip; duplicates and cross-blog categories roll back", async () => {
  const { db, sqlite } = database();
  try {
    const saved = await createPost(db, "a", input);
    assert.deepEqual(saved.content, input.content);
    assert.equal(saved.coverAlt, input.coverAlt);
    assert.equal(saved.status, "draft");
    assert.equal(saved.revision, 1);
    assert.equal(
      (await getPost(db, "a", saved.id)).seoDescription,
      input.seoDescription,
    );
    await assert.rejects(
      () => getPost(db, "b", saved.id),
      (e) => e.status === 404,
    );
    await assert.rejects(
      () => createPost(db, "a", input),
      (e) => e.status === 409,
    );
    const [other] = await createCategory(db, "b", {
      name: "B 분류",
      slug: "b",
      description: "",
      order: 1,
    });
    await assert.rejects(
      () =>
        createPost(db, "a", {
          ...input,
          slug: "bad-category",
          categoryId: other.id,
        }),
      (e) => e.status === 409,
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM posts").get().n, 1);
    assert.equal(
      sqlite.prepare("SELECT count(*) AS n FROM post_seo").get().n,
      1,
    );
  } finally {
    sqlite.close();
  }
});
test("revision conflicts preserve both post and SEO; failed category change rolls back SEO; metadata-only edits keep content timestamp", async () => {
  const { db, sqlite } = database();
  try {
    const first = await createPost(db, "a", input);
    const stamp = sqlite
      .prepare("SELECT content_updated_at AS t FROM posts")
      .get().t;
    const second = await updatePost(
      db,
      "a",
      first.id,
      { ...input, seoTitle: "새 검색 제목" },
      1,
    );
    assert.equal(second.revision, 2);
    assert.equal(
      sqlite.prepare("SELECT content_updated_at AS t FROM posts").get().t,
      stamp,
    );
    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          first.id,
          { ...input, title: "덮어쓰기", seoTitle: "덮어쓰기" },
          1,
        ),
      (e) => e.status === 409,
    );
    assert.equal((await getPost(db, "a", first.id)).seoTitle, "새 검색 제목");
    const [other] = await createCategory(db, "b", {
      name: "다른 분류",
      slug: "other",
      description: "",
      order: 1,
    });
    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          first.id,
          { ...input, categoryId: other.id, seoTitle: "반영되면 안 됨" },
          2,
        ),
      (e) => e.status === 409,
    );
    assert.equal((await getPost(db, "a", first.id)).seoTitle, "새 검색 제목");
    const third = await updatePost(
      db,
      "a",
      first.id,
      { ...input, title: "수정 제목", seoTitle: "", seoDescription: "" },
      2,
    );
    assert.equal(third.revision, 3);
    assert.equal(
      sqlite.prepare("SELECT title_source FROM post_seo").get().title_source,
      "auto",
    );
    assert.ok(
      sqlite.prepare("SELECT content_updated_at AS t FROM posts").get().t >
        stamp,
    );
    sqlite.exec("UPDATE posts SET status='published',published_at=updated_at");
    await assert.rejects(
      () => updatePost(db, "a", first.id, input, 3),
      (e) => e.status === 409,
    );
  } finally {
    sqlite.close();
  }
});
test("managed covers stay scoped to the blog and change only with the matching draft revision", async () => {
  const { db, sqlite } = database();
  try {
    const mediaId = crypto.randomUUID();
    const otherMediaId = crypto.randomUUID();
    const addMedia = sqlite.prepare(
      "INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes) VALUES(?,?,?,'cover.png','image/png',42)",
    );
    addMedia.run(mediaId, "a", "covers/a/first");
    addMedia.run(otherMediaId, "b", "covers/b/other");
    const cover = {
      ...input,
      coverUrl: "",
      coverMediaId: mediaId,
      coverAlt: "산책길 사진",
    };
    assert.equal(
      postInputSchema.safeParse({ ...cover, coverUrl: input.coverUrl }).success,
      false,
    );
    assert.equal(
      postInputSchema.safeParse({ ...cover, coverAlt: "" }).success,
      false,
    );
    await assert.rejects(
      () => createPost(db, "b", cover),
      (error) => error.status === 400,
    );
    const saved = await createPost(db, "a", cover);
    assert.equal(saved.coverMediaId, mediaId);
    assert.equal(saved.coverAlt, cover.coverAlt);
    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          saved.id,
          { ...cover, coverMediaId: otherMediaId },
          1,
        ),
      (error) => error.status === 400,
    );
    const [foreignCategory] = await createCategory(db, "b", {
      name: "다른 분류",
      slug: "foreign",
      description: "",
      order: 1,
    });
    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          saved.id,
          { ...input, categoryId: foreignCategory.id },
          1,
        ),
      (error) => error.status === 409,
    );
    assert.equal((await getPost(db, "a", saved.id)).coverMediaId, mediaId);
    const updated = await updatePost(
      db,
      "a",
      saved.id,
      { ...cover, coverAlt: "수정한 설명" },
      1,
    );
    await assert.rejects(
      () => updatePost(db, "a", saved.id, input, 1),
      (error) => error.status === 409,
    );
    assert.equal((await getPost(db, "a", saved.id)).coverAlt, updated.coverAlt);
    const external = await updatePost(db, "a", saved.id, input, 2);
    assert.equal(external.coverMediaId, null);
    assert.equal(external.coverUrl, input.coverUrl);
    assert.equal(external.coverAlt, input.coverAlt);
  } finally {
    sqlite.close();
  }
});
test("server list search, literal wildcard, category, status and pagination stay inside blog", async () => {
  const { db, sqlite } = database();
  try {
    const [category] = await createCategory(db, "a", {
      name: "일상",
      slug: "daily",
      description: "",
      order: 1,
    });
    for (let i = 0; i < 7; i++)
      await createPost(db, "a", {
        ...input,
        title: "목록 " + i,
        slug: "list-" + i,
        categoryId: i === 0 ? category.id : null,
      });
    await createPost(db, "b", { ...input, title: "다른 블로그" });
    const q = postListQuerySchema.parse({});
    const first = await listPosts(db, "a", q);
    assert.equal(first.total, 7);
    assert.equal(first.posts.length, 5);
    const second = await listPosts(db, "a", { ...q, page: 2 });
    assert.equal(second.posts.length, 2);
    assert.equal(
      new Set([...first.posts, ...second.posts].map((p) => p.id)).size,
      7,
    );
    assert.equal((await listPosts(db, "a", { ...q, q: "목록 0" })).total, 1);
    assert.equal((await listPosts(db, "a", { ...q, q: "%" })).total, 0);
    assert.equal(
      (await listPosts(db, "a", { ...q, category: category.id })).total,
      1,
    );
    assert.equal(
      (await listPosts(db, "a", { ...q, category: "uncategorized" })).total,
      6,
    );
    assert.equal(
      (await listPosts(db, "a", { ...q, status: "published" })).total,
      0,
    );
    assert.equal((await listPosts(db, "a", { ...q, page: 999 })).page, 2);
  } finally {
    sqlite.close();
  }
});
