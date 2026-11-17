CREATE TABLE post_source_images (
  post_id TEXT PRIMARY KEY NOT NULL,
  blog_id TEXT NOT NULL,
  candidates_json TEXT NOT NULL CHECK(json_valid(candidates_json) AND json_type(candidates_json)='array'),
  FOREIGN KEY(blog_id,post_id) REFERENCES posts(blog_id,id) ON DELETE CASCADE
) STRICT;