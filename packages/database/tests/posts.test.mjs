import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  countPublishedPosts,
  listPublishedPosts,
  listPublishedSitemapPosts,
  listPublicCategories,
  readPublishedMedia,
  readPublishedPost,
} from "../src/public-blog.ts";
const { managedImageSrc } = await import("../../shared/src/posts.ts");
const { postInputSchema, postListQuerySchema } =
  await import("../../shared/src/management.ts");
const {
  createPost,
  getPost,
  updatePost,
  deletePostDraft,
  setPostPublication,
  getPostQaReview,
  savePostQaReview,
  listPosts,
  getPostDashboard,
  createCategory,
} = await import("../src/management.ts");
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
          if (stmt.columns().length) return { results: stmt.all(...bound) };
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
test("AI draft links cover and inline media atomically and serves only published associations", async () => {
  const { db, sqlite } = database();
  try {
    const mediaId = crypto.randomUUID();
    const inlineId = crypto.randomUUID();
    const inlineKey = `covers/a/${inlineId}.jpg`;
    const image = {
      type: "image",
      attrs: { src: managedImageSrc(inlineId), alt: "키보드 스위치" },
    };
    const sourceImages = [
      {
        url: "https://publisher.org/images/keyboard.jpg",
        pageUrl: "https://publisher.org/keyboard",
        title: "키보드 자료",
        alt: "키보드",
        caption: "",
        creator: "",
        license: null,
      },
    ];
    const seoDescription = "검색 결과에 표시할 설명";
    const draftInput = {
      ...input,
      content: { ...input.content, content: [...input.content.content, image] },
      seoTitle: "검색 결과 제목",
      seoDescription,
      coverUrl: "",
      coverMediaId: mediaId,
      coverAlt: "책상 위의 키보드",
    };
    const key = `covers/a/${mediaId}.jpg`;
    const post = await createPost(db, "a", draftInput, {
      origin: "ai",
      sourceImages,
      newMedia: [
        { id: mediaId, key, sizeBytes: 42 },
        { id: inlineId, key: inlineKey, sizeBytes: 52 },
      ],
    });
    assert.equal(post.coverMediaId, mediaId);
    assert.deepEqual(post.sourceImages, sourceImages);
    assert.equal(post.coverAlt, draftInput.coverAlt);
    assert.equal(post.seoTitle, draftInput.seoTitle);
    assert.equal(post.seoDescription, seoDescription);
    assert.equal(
      sqlite.prepare("SELECT r2_key FROM media WHERE id=?").get(mediaId).r2_key,
      key,
    );

    assert.equal(post.content.content.at(-1).attrs.src, image.attrs.src);
    assert.equal(await readPublishedMedia(db, "a", post.id, inlineId), null);
    const setStatus = sqlite.prepare(
      "UPDATE posts SET status=?,published_at=? WHERE id=?",
    );
    setStatus.run("published", Date.now(), post.id);
    assert.equal(
      (await readPublishedMedia(db, "a", post.id, inlineId)).key,
      inlineKey,
    );
    assert.equal(await readPublishedMedia(db, "b", post.id, inlineId), null);
    setStatus.run("private", Date.now(), post.id);

    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          post.id,
          { ...draftInput, content: input.content },
          post.revision + 1,
        ),
      { status: 409 },
    );
    assert.equal(
      sqlite
        .prepare("SELECT alt FROM post_media WHERE media_id=?")
        .get(inlineId).alt,
      image.attrs.alt,
    );
    await updatePost(
      db,
      "a",
      post.id,
      { ...draftInput, content: input.content },
      post.revision,
    );
    setStatus.run("published", Date.now(), post.id);
    assert.equal(await readPublishedMedia(db, "a", post.id, inlineId), null);
    assert.ok(await readPublishedMedia(db, "a", post.id, mediaId));
    assert.deepEqual(
      (await getPost(db, "a", post.id)).sourceImages,
      sourceImages,
    );

    const rejectedId = crypto.randomUUID();
    await assert.rejects(
      () =>
        createPost(
          db,
          "a",
          { ...draftInput, coverMediaId: rejectedId },
          {
            origin: "ai",
            newMedia: [
              {
                id: rejectedId,
                key: `covers/a/${rejectedId}.jpg`,
                sizeBytes: 42,
              },
            ],
          },
        ),
      { status: 409 },
    );
    assert.equal(
      sqlite.prepare("SELECT 1 FROM media WHERE id=?").get(rejectedId),
      undefined,
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
test("publishing is revision-safe and preserves the first date and URL through private edits", async () => {
  const { db, sqlite } = database();
  try {
    const draft = await createPost(db, "a", input);
    const publish = { status: "published", expectedRevision: draft.revision };
    assert.equal(draft.publishedAt, null);
    await assert.rejects(
      () => setPostPublication(db, "b", draft.id, publish),
      (error) => error.status === 404,
    );
    await assert.rejects(
      () =>
        setPostPublication(db, "a", draft.id, {
          ...publish,
          status: "private",
        }),
      (error) => error.status === 409,
    );

    const attempts = await Promise.allSettled([
      setPostPublication(db, "a", draft.id, publish),
      setPostPublication(db, "a", draft.id, publish),
    ]);
    const succeeded = attempts.filter(
      (result) => result.status === "fulfilled",
    );
    assert.equal(succeeded.length, 1);
    assert.equal(
      attempts.find((result) => result.status === "rejected").reason.status,
      409,
    );
    const first = succeeded[0].value;
    assert.equal(first.revision, 2);
    assert.ok(first.publishedAt);

    await assert.rejects(
      () =>
        setPostPublication(db, "a", draft.id, {
          status: "private",
          expectedRevision: 1,
        }),
      (error) => error.status === 409,
    );
    const hidden = await setPostPublication(db, "a", draft.id, {
      status: "private",
      expectedRevision: 2,
    });
    assert.deepEqual(hidden, {
      status: "private",
      revision: 3,
      publishedAt: first.publishedAt,
    });
    await assert.rejects(
      () =>
        updatePost(
          db,
          "a",
          draft.id,
          { ...input, slug: "other-slug", seoTitle: "바뀌면 안 되는 SEO" },
          3,
        ),
      (error) => error.status === 409,
    );
    assert.equal((await getPost(db, "a", draft.id)).seoTitle, input.seoTitle);
    const edited = await updatePost(
      db,
      "a",
      draft.id,
      { ...input, title: "수정한 글" },
      3,
    );
    assert.equal(edited.slug, input.slug);
    const republished = await setPostPublication(db, "a", draft.id, {
      status: "published",
      expectedRevision: edited.revision,
    });
    assert.equal(republished.publishedAt, first.publishedAt);
    assert.equal(
      (
        await listPosts(
          db,
          "a",
          postListQuerySchema.parse({ status: "published" }),
        )
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("an empty draft or an AI draft without QA cannot be published", async () => {
  const { db, sqlite } = database();
  try {
    const empty = await createPost(db, "a", {
      ...input,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    const ai = await createPost(db, "a", { ...input, slug: "ai-draft" });
    sqlite.prepare("UPDATE posts SET origin='ai' WHERE id=?").run(ai.id);
    const publish = { status: "published", expectedRevision: 1 };
    await assert.rejects(
      () => setPostPublication(db, "a", empty.id, publish),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () => setPostPublication(db, "a", ai.id, publish),
      (error) => error.status === 409,
    );
    assert.equal((await getPost(db, "a", empty.id)).revision, 1);
    assert.equal((await getPost(db, "a", ai.id)).status, "draft");
  } finally {
    sqlite.close();
  }
});

test("AI publication requires a clean QA result for the current saved revision", async () => {
  const { db, sqlite } = database();
  try {
    const post = await createPost(db, "a", input, { origin: "ai" });
    const publish = (revision) =>
      setPostPublication(db, "a", post.id, {
        status: "published",
        expectedRevision: revision,
      });
    const issue = {
      excerpt: "검토할 문장",
      reason: "출처를 추가해 주세요.",
      sources: [],
    };
    await savePostQaReview(db, "a", post.id, post.revision, [issue]);
    assert.deepEqual((await getPostQaReview(db, "a", post.id)).issues, [issue]);
    await assert.rejects(() => publish(post.revision), { status: 409 });

    await savePostQaReview(db, "a", post.id, post.revision, []);
    const edited = await updatePost(
      db,
      "a",
      post.id,
      { ...input, title: "수정한 제목" },
      post.revision,
    );
    assert.equal(await getPostQaReview(db, "a", post.id), null);
    await assert.rejects(
      () => savePostQaReview(db, "a", post.id, post.revision, []),
      { status: 409 },
    );
    await assert.rejects(
      () => savePostQaReview(db, "b", post.id, edited.revision, []),
      { status: 409 },
    );
    await assert.rejects(() => publish(edited.revision), { status: 409 });

    await savePostQaReview(db, "a", post.id, edited.revision, []);
    assert.equal((await publish(edited.revision)).status, "published");
  } finally {
    sqlite.close();
  }
});

test("public queries expose only this blog's published posts and covers attached to those posts", async () => {
  const { db, sqlite } = database();
  try {
    const category = (
      await createCategory(db, "a", {
        name: "여행",
        slug: "travel",
        description: "",
        order: 1,
      })
    )[0];
    const otherCategory = (
      await createCategory(db, "b", {
        name: "다른 블로그",
        slug: "other",
        description: "",
        order: 1,
      })
    )[0];
    const mediaId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes) VALUES(?,'a','cover/a','image.png','image/png',42)",
      )
      .run(mediaId);

    const covered = {
      ...input,
      coverMediaId: mediaId,
      coverUrl: "",
      categoryId: category.id,
    };
    const publicPost = await createPost(db, "a", {
      ...covered,
      slug: "공개-글",
    });
    const draft = await createPost(db, "a", { ...covered, slug: "draft" });
    const hidden = await createPost(db, "a", { ...covered, slug: "hidden" });
    const otherPost = await createPost(db, "b", {
      ...input,
      categoryId: otherCategory.id,
      slug: "other",
    });
    for (const [blogId, post] of [
      ["a", publicPost],
      ["a", hidden],
      ["b", otherPost],
    ]) {
      await setPostPublication(db, blogId, post.id, {
        status: "published",
        expectedRevision: 1,
      });
    }
    await setPostPublication(db, "a", hidden.id, {
      status: "private",
      expectedRevision: 2,
    });

    assert.deepEqual(
      (await listPublicCategories(db, "a")).map((item) => item.id),
      [category.id],
    );
    assert.equal(await countPublishedPosts(db, "a", category.id), 1);
    assert.equal(await countPublishedPosts(db, "a", otherCategory.id), 0);
    const visible = await listPublishedPosts(db, "a", { limit: 4 });
    assert.deepEqual(
      visible.map((item) => item.id),
      [publicPost.id],
    );
    assert.equal(visible[0].categorySlug, category.slug);
    const detail = await readPublishedPost(db, "a", publicPost.slug);
    assert.equal(detail.content.type, "doc");
    assert.equal(detail.seoTitle, input.seoTitle);
    assert.equal(detail.seoDescription, input.seoDescription);
    assert.equal(detail.contentUpdatedAt, publicPost.updatedAt);
    const sitemap = await listPublishedSitemapPosts(db, "a");
    assert.equal(sitemap.length, 1);
    assert.equal(sitemap[0].slug, publicPost.slug);
    assert.equal(sitemap[0].publishedAt, detail.publishedAt);
    assert.equal(sitemap[0].contentUpdatedAt, detail.contentUpdatedAt);
    for (const post of [draft, hidden, otherPost]) {
      assert.equal(await readPublishedPost(db, "a", post.slug), null);
      assert.equal(await readPublishedMedia(db, "a", post.id, mediaId), null);
    }
    assert.equal(
      await readPublishedMedia(db, "b", publicPost.id, mediaId),
      null,
    );
    const cover = await readPublishedMedia(db, "a", publicPost.id, mediaId);
    assert.equal(cover?.key, "cover/a");
    assert.equal(cover?.mimeType, "image/png");
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

test("deleting a draft requires its latest revision and preserves published and private posts", async () => {
  const { db, sqlite } = database();
  try {
    const draft = await createPost(db, "a", input, { origin: "ai" });
    const manual = await createPost(db, "a", { ...input, slug: "manual" });
    await assert.rejects(deletePostDraft(db, "b", draft.id, draft.revision), {
      status: 404,
    });
    const edited = await updatePost(
      db,
      "a",
      draft.id,
      { ...input, title: "수정한 초안" },
      draft.revision,
    );
    await assert.rejects(deletePostDraft(db, "a", draft.id, draft.revision), {
      status: 409,
    });
    await deletePostDraft(db, "a", draft.id, edited.revision);
    await assert.rejects(getPost(db, "a", draft.id), { status: 404 });
    assert.equal(
      sqlite.prepare("SELECT 1 FROM post_seo WHERE post_id=?").get(draft.id),
      undefined,
    );

    const published = await setPostPublication(db, "a", manual.id, {
      status: "published",
      expectedRevision: manual.revision,
    });
    await assert.rejects(
      deletePostDraft(db, "a", manual.id, published.revision),
      { status: 409 },
    );
    const hidden = await setPostPublication(db, "a", manual.id, {
      status: "private",
      expectedRevision: published.revision,
    });
    await assert.rejects(deletePostDraft(db, "a", manual.id, hidden.revision), {
      status: 409,
    });
    assert.equal((await getPost(db, "a", manual.id)).status, "private");

    const anotherDraft = await createPost(db, "a", {
      ...input,
      slug: "another-draft",
    });
    await deletePostDraft(db, "a", anotherDraft.id, anotherDraft.revision);
    await assert.rejects(getPost(db, "a", anotherDraft.id), { status: 404 });
  } finally {
    sqlite.close();
  }
});

test("dashboard counts every status and returns only the five latest posts for this blog", async () => {
  const { db, sqlite } = database();
  try {
    assert.deepEqual((await getPostDashboard(db, "a")).recentPosts, []);
    assert.deepEqual(
      { ...(await getPostDashboard(db, "a")).counts },
      { total: 0, draft: 0, published: 0, private: 0 },
    );

    const insert = sqlite.prepare(
      `INSERT INTO posts(id,blog_id,title,slug,status,created_at,updated_at,content_updated_at,published_at)
      VALUES(?,?,?,?,?,1000,?,1000,?)`,
    );
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    for (const [index, id] of ids.entries()) {
      const status =
        index < 4 ? "draft" : index === 4 ? "published" : "private";
      insert.run(
        id,
        "a",
        `글 ${index}`,
        `post-${index}`,
        status,
        1000 + index,
        status === "published" ? 1000 : null,
      );
    }
    insert.run(
      crypto.randomUUID(),
      "b",
      "다른 블로그",
      "other-post",
      "published",
      2000,
      1000,
    );

    const { counts, recentPosts } = await getPostDashboard(db, "a");
    assert.deepEqual(
      { ...counts },
      { total: 6, draft: 4, published: 1, private: 1 },
    );
    assert.deepEqual(
      recentPosts.map((post) => post.id),
      ids.slice(1).reverse(),
    );
    assert.equal(recentPosts[0].category, "미분류");
  } finally {
    sqlite.close();
  }
});
