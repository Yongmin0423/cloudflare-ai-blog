ALTER TABLE blogs ADD COLUMN draft_runner_key_hash TEXT;
CREATE TABLE subscription_drafts (
  blog_id TEXT NOT NULL REFERENCES blogs(id),
  id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('chatgpt','claude')),
  input_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','writing','saving','saved','failed')),
  claim TEXT,
  updated_at INTEGER NOT NULL,
  error TEXT,
  PRIMARY KEY(blog_id,id)
);
CREATE INDEX subscription_drafts_queue ON subscription_drafts(blog_id,provider,state,updated_at);
