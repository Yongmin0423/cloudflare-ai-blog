-- Local-only schema smoke test. Uses reserved probe IDs and removes its own rows.
INSERT INTO blogs(id,name) VALUES('__schema_probe_blog','스키마 검증');
INSERT INTO blog_writing_settings(blog_id,topic) VALUES('__schema_probe_blog','검증');
INSERT INTO categories(id,blog_id,name,slug) VALUES('__schema_probe_category','__schema_probe_blog','검증 분류','schema-probe');
INSERT INTO posts(id,blog_id,category_id,title,slug) VALUES('__schema_probe_post','__schema_probe_blog','__schema_probe_category','검증 글','schema-probe');
INSERT INTO post_seo(post_id,blog_id,meta_title,title_source) VALUES('__schema_probe_post','__schema_probe_blog','검증 SEO','manual');
INSERT INTO media(id,blog_id,r2_key,original_name,mime_type,size_bytes) VALUES('__schema_probe_media','__schema_probe_blog','__schema_probe/file.png','probe.png','image/png',100);
INSERT INTO post_media(post_id,media_id,blog_id,usage,alt,position) VALUES('__schema_probe_post','__schema_probe_media','__schema_probe_blog','cover','검증 이미지',0);
SELECT p.title, c.name AS category, s.title_source, pm.usage, m.r2_key
FROM posts p JOIN categories c ON c.id=p.category_id AND c.blog_id=p.blog_id
JOIN post_seo s ON s.post_id=p.id JOIN post_media pm ON pm.post_id=p.id
JOIN media m ON m.id=pm.media_id WHERE p.id='__schema_probe_post';
DELETE FROM posts WHERE id='__schema_probe_post';
SELECT (SELECT count(*) FROM post_seo WHERE post_id='__schema_probe_post') AS seo_after_delete,
       (SELECT count(*) FROM post_media WHERE post_id='__schema_probe_post') AS media_links_after_delete;
DELETE FROM media WHERE id='__schema_probe_media';
DELETE FROM categories WHERE id='__schema_probe_category';
DELETE FROM blogs WHERE id='__schema_probe_blog';
SELECT count(*) AS settings_after_blog_delete FROM blog_writing_settings WHERE blog_id='__schema_probe_blog';
PRAGMA foreign_key_check;
