-- External URL input retained until R2 media selection is connected.
ALTER TABLE posts ADD COLUMN cover_url TEXT NOT NULL DEFAULT '' CHECK(length(cover_url) <= 2048);
ALTER TABLE posts ADD COLUMN cover_alt TEXT NOT NULL DEFAULT '' CHECK(length(cover_alt) <= 500);
