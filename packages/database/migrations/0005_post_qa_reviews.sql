CREATE TABLE post_qa_reviews (
  post_id TEXT PRIMARY KEY NOT NULL,
  blog_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  reviewed_at INTEGER NOT NULL CHECK (reviewed_at > 0),
  issues_json TEXT NOT NULL CHECK (json_valid(issues_json) AND json_type(issues_json) = 'array'),
  FOREIGN KEY (blog_id, post_id) REFERENCES posts(blog_id, id) ON DELETE CASCADE
);
