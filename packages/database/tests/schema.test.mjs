import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const schema = readFileSync(new URL('../migrations/0001_blog_schema.sql', import.meta.url), 'utf8');
function database() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.exec(schema);
  db.exec("INSERT INTO blogs(id,name) VALUES('a','A'),('b','B'); INSERT INTO categories(id,blog_id,name,slug) VALUES('ca','a','일상','daily'),('cb','b','일상','daily');");
  return db;
}
function addPost(db, id = 'p', blog = 'a', category = 'ca', slug = id) {
  db.prepare('INSERT INTO posts(id,blog_id,category_id,title,slug) VALUES(?,?,?,?,?)').run(id, blog, category, '제목', slug);
}
function addMedia(db, id = 'm', blog = 'a') {
  db.prepare('INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').run(id, blog, `${blog}/${id}.png`, 'image.png','image/png',100);
}

test('migration creates seven business tables and local defaults', () => {
  const db = database(); try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,7);
    addPost(db);
    const row = db.prepare('SELECT * FROM posts').get();
    assert.equal(row.status,'draft'); assert.equal(row.origin,'manual'); assert.equal(row.revision,1);
    assert.equal(JSON.parse(row.content_json).type,'doc'); assert.equal(typeof row.created_at,'number');
  } finally { db.close(); }
});
test('slugs and category names are unique per blog and ASCII case-insensitive', () => {
  const db = database(); try {
    addPost(db,'p1','a','ca','same'); addPost(db,'p2','b','cb','same');
    assert.throws(() => addPost(db,'p3','a','ca','SAME'), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO categories(id,blog_id,name,slug) VALUES('x','a','새분류','DAILY')"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO categories(id,blog_id,name,slug) VALUES('x','a','일상','other')"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO categories(id,blog_id,name,slug) VALUES('x','a','미분류','uncategorized')"), /CHECK/);
  } finally { db.close(); }
});
test('cross-blog category references and category deletion with posts are blocked', () => {
  const db = database(); try {
    assert.throws(() => addPost(db,'wrong','a','cb'), /FOREIGN KEY/);
    addPost(db);
    assert.throws(() => db.exec("DELETE FROM categories WHERE id='ca'"), /FOREIGN KEY/);
    assert.throws(() => db.exec("UPDATE posts SET category_id='cb' WHERE id='p'"), /FOREIGN KEY/);
    db.exec("UPDATE posts SET category_id=NULL WHERE id='p'; DELETE FROM categories WHERE id='ca'");
    assert.equal(db.prepare("SELECT category_id FROM posts WHERE id='p'").get().category_id,null);
  } finally { db.close(); }
});
test('body JSON rejects missing root fields, wrong roots and malformed JSON', () => {
  const db = database(); try {
    addPost(db);
    const update = db.prepare("UPDATE posts SET content_json=? WHERE id='p'");
    for (const json of ['{broken','{}','[]','null','{"type":"paragraph","content":[]}','{"type":"doc"}','{"type":"doc","content":{}}']) assert.throws(() => update.run(json));
    update.run('{"type":"doc","content":[]}');
  } finally { db.close(); }
});
test('status, publishing date, timestamps and numeric domains are constrained', () => {
  const db = database(); try {
    addPost(db);
    for (const sql of ["UPDATE posts SET status='unknown'", "UPDATE posts SET origin='external'", "UPDATE posts SET status='published'", "UPDATE posts SET revision=0", "UPDATE categories SET sort_order=0", "UPDATE categories SET sort_order=1.5", "UPDATE posts SET updated_at=1"]) assert.throws(() => db.exec(sql));
    db.exec("UPDATE posts SET status='published', published_at=created_at; UPDATE posts SET status='private'");
    assert.ok(db.prepare('SELECT published_at FROM posts').get().published_at);
  } finally { db.close(); }
});
test('SEO isolates blogs, preserves independent sources and cascades on post deletion', () => {
  const db = database(); try {
    addPost(db);
    assert.throws(() => db.exec("INSERT INTO post_seo(post_id,blog_id) VALUES('p','b')"), /FOREIGN KEY/);
    db.exec("INSERT INTO post_seo(post_id,blog_id,meta_title,title_source) VALUES('p','a','직접 수정한 제목','manual')");
    const row = db.prepare('SELECT * FROM post_seo').get(); assert.equal(row.title_source,'manual'); assert.equal(row.description_source,'auto');
    assert.throws(() => db.exec("UPDATE post_seo SET description_source='manual'"), /CHECK/);
    db.exec("DELETE FROM posts WHERE id='p'"); assert.equal(db.prepare('SELECT count(*) AS n FROM post_seo').get().n,0);
  } finally { db.close(); }
});
test('media relations block cross-blog files and duplicate covers while allowing reuse', () => {
  const db = database(); try {
    addPost(db); addPost(db,'p2'); addMedia(db); addMedia(db,'m2'); addMedia(db,'foreign','b');
    const link = db.prepare('INSERT INTO post_media(post_id,media_id,blog_id,usage,alt,position) VALUES(?,?,?,?,?,?)');
    assert.throws(() => link.run('p','foreign','a','inline','설명',1), /FOREIGN KEY/);
    link.run('p','m','a','cover','대표 이미지',0);
    assert.throws(() => link.run('p','m2','a','cover','대표 이미지2',0), /UNIQUE/);
    assert.throws(() => link.run('p','m2','a','cover','대표 이미지2',1), /CHECK/);
    assert.throws(() => link.run('p','m','a','inline','',1), /CHECK/);
    link.run('p','m','a','inline','본문 이미지',1); link.run('p2','m','a','cover','다른 글의 설명',0);
    assert.throws(() => db.exec("DELETE FROM media WHERE id='m'"), /FOREIGN KEY/);
    db.exec("DELETE FROM posts WHERE id='p'"); assert.equal(db.prepare('SELECT count(*) AS n FROM post_media').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM media').get().n,3);
  } finally { db.close(); }
});
test('domain uniqueness and foreign-key audit', () => {
  const db = database(); try {
    db.exec("UPDATE blogs SET domain='example.com' WHERE id='a'");
    assert.throws(() => db.exec("UPDATE blogs SET domain='example.com' WHERE id='b'"), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE blogs SET domain='https://example.com' WHERE id='b'"), /CHECK/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});
