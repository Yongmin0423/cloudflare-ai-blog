-- Explicit local bootstrap only. Does not copy browser data or reset existing data.
INSERT INTO blogs(id,name,description,language) VALUES('10000000-0000-4000-8000-000000000001','나의 블로그','','ko') ON CONFLICT(id) DO NOTHING;
INSERT INTO blog_writing_settings(blog_id,tone) VALUES('10000000-0000-4000-8000-000000000001','친절하고 이해하기 쉬운 말투') ON CONFLICT(blog_id) DO NOTHING;
