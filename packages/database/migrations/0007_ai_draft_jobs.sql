CREATE TABLE ai_draft_jobs (
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  keyword TEXT NOT NULL CHECK (length(trim(keyword)) BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('running', 'failed', 'succeeded')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (blog_id, request_id)
);
