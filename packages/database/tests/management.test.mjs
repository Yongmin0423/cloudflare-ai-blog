import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const { categoryInputSchema, settingsSchema } =
  await import("../../shared/src/management.ts");
const {
  createCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  getSettings,
  saveSettings,
} = await import("../src/management.ts");
const { readPublicBlog, readSiteShareImage } =
  await import("../src/public-blog.ts");
const migrations = new URL("../migrations/", import.meta.url);
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
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
const category = {
  name: "새 분류",
  slug: "new-category",
  description: "",
  order: 1,
};
test("shared contracts normalize input and reject hidden blog ownership fields", () => {
  assert.equal(
    categoryInputSchema.parse({ ...category, slug: " NEW-CATEGORY " }).slug,
    "new-category",
  );
  assert.equal(
    categoryInputSchema.safeParse({ ...category, blogId: "other" }).success,
    false,
  );
  assert.equal(
    categoryInputSchema.safeParse({ ...category, order: NaN }).success,
    false,
  );
  assert.equal(
    categoryInputSchema.safeParse({ ...category, name: "미분류" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ name: "missing fields" }).success,
    false,
  );
});
test("category CRUD, duplicate checks, stale writes, and blog isolation", async () => {
  const { db, sqlite } = database();
  try {
    let rows = await createCategory(db, "a", category);
    const first = rows[0];
    assert.equal(first.postCount, 0);
    await assert.rejects(
      () => createCategory(db, "a", category),
      (error) => error.status === 409,
    );
    await createCategory(db, "b", category);
    assert.equal((await listCategories(db, "b")).length, 1);
    await assert.rejects(
      () =>
        updateCategory(
          db,
          "b",
          first.id,
          { ...category, name: "다른 이름" },
          first.updatedAt,
        ),
      (error) => error.status === 409,
    );
    rows = await updateCategory(
      db,
      "a",
      first.id,
      { ...category, name: "수정 분류" },
      first.updatedAt,
    );
    assert.equal(rows[0].name, "수정 분류");
    await assert.rejects(
      () => updateCategory(db, "a", first.id, category, first.updatedAt),
      (error) => error.status === 409,
    );
    await assert.rejects(
      () => deleteCategory(db, "a", first.id, first.updatedAt),
      (error) => error.status === 409,
    );
    rows = await deleteCategory(db, "a", first.id, rows[0].updatedAt);
    assert.equal(rows.length, 0);
    assert.equal((await listCategories(db, "b")).length, 1);
  } finally {
    sqlite.close();
  }
});
test("categories with real draft posts cannot be deleted", async () => {
  const { db, sqlite } = database();
  try {
    const [c] = await createCategory(db, "a", category);
    sqlite
      .prepare(
        "INSERT INTO posts(id,blog_id,category_id,title,slug) VALUES('p','a',?,'글','post')",
      )
      .run(c.id);
    assert.equal((await listCategories(db, "a"))[0].postCount, 1);
    await assert.rejects(
      () => deleteCategory(db, "a", c.id, c.updatedAt),
      (error) => error.status === 409,
    );
    assert.equal((await listCategories(db, "a")).length, 1);
  } finally {
    sqlite.close();
  }
});
test("settings and writing rules save atomically; stale writes leave both unchanged", async () => {
  const { db, sqlite } = database();
  try {
    const initial = await getSettings(db, "a");
    const result = await saveSettings(
      db,
      "a",
      { ...initial.settings, name: "내 블로그", rules: "확인할 규칙" },
      initial.updatedAt,
    );
    assert.equal(result.settings.name, "내 블로그");
    assert.equal(result.settings.rules, "확인할 규칙");
    assert.ok(result.updatedAt > initial.updatedAt);
    await assert.rejects(
      () =>
        saveSettings(
          db,
          "a",
          { ...result.settings, name: "옛 요청", rules: "덮어쓰기" },
          initial.updatedAt,
        ),
      (error) => error.status === 409,
    );
    const after = await getSettings(db, "a");
    assert.equal(after.settings.name, "내 블로그");
    assert.equal(after.settings.rules, "확인할 규칙");
    assert.equal((await getSettings(db, "b")).settings.name, "B");
  } finally {
    sqlite.close();
  }
});

test("site SEO retains settings across legacy writes and exposes only the selected blog image", async () => {
  const { db, sqlite } = database();
  try {
    const mediaId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes) VALUES(?,'a','share.png','share.png','image/png',100)",
      )
      .run(mediaId);
    const initial = await getSettings(db, "a");
    assert.equal(initial.settings.seo.shareMediaId, null);
    assert.equal(await readSiteShareImage(db, "a", mediaId), null);

    const seo = {
      title: "Home title",
      description: "Home description",
      shareMediaId: mediaId,
      shareImageAlt: "Share image",
    };
    const saved = await saveSettings(
      db,
      "a",
      { ...initial.settings, seo },
      initial.updatedAt,
    );
    assert.deepEqual(saved.settings.seo, seo);
    assert.equal((await readPublicBlog(db, "a")).seoTitle, seo.title);
    assert.equal((await readSiteShareImage(db, "a", mediaId)).key, "share.png");
    assert.equal(await readSiteShareImage(db, "b", mediaId), null);
    const other = await getSettings(db, "b");
    await assert.rejects(
      () => saveSettings(db, "b", { ...other.settings, seo }, other.updatedAt),
      { status: 400 },
    );

    const { seo: ignoredSeo, ...legacySettings } = saved.settings;
    const renamed = await saveSettings(
      db,
      "a",
      { ...legacySettings, name: "New name" },
      saved.updatedAt,
    );
    assert.deepEqual(renamed.settings.seo, seo);
    const clearedSeo = { ...seo, shareMediaId: null, shareImageAlt: "" };
    await assert.rejects(
      () =>
        saveSettings(
          db,
          "a",
          { ...renamed.settings, seo: clearedSeo },
          saved.updatedAt,
        ),
      { status: 409 },
    );
    assert.deepEqual((await getSettings(db, "a")).settings.seo, seo);

    await saveSettings(
      db,
      "a",
      { ...renamed.settings, seo: clearedSeo },
      renamed.updatedAt,
    );
    assert.equal(await readSiteShareImage(db, "a", mediaId), null);
  } finally {
    sqlite.close();
  }
});
