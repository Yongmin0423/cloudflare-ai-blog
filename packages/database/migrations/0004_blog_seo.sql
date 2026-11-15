CREATE TABLE blog_seo (
  blog_id TEXT PRIMARY KEY NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  meta_title TEXT NOT NULL DEFAULT '' CHECK(length(meta_title) <= 100),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 300),
  share_media_id TEXT,
  share_image_alt TEXT NOT NULL DEFAULT '' CHECK(length(share_image_alt) <= 500),
  FOREIGN KEY (blog_id, share_media_id) REFERENCES media(blog_id, id) ON DELETE RESTRICT,
  CHECK (
    (share_media_id IS NULL AND share_image_alt = '') OR
    (share_media_id IS NOT NULL AND length(trim(share_image_alt)) > 0)
  )
) STRICT;
