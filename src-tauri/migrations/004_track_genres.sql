-- Add artist_ids (JSON array of Spotify artist IDs) and genres
-- (JSON array of raw Spotify genre strings from the artist endpoint)
-- to the tracks table. Both default to NULL for existing rows.
ALTER TABLE tracks ADD COLUMN artist_ids TEXT;
ALTER TABLE tracks ADD COLUMN genres TEXT;
