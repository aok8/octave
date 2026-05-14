CREATE TABLE IF NOT EXISTS discovery_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    seed_track_id TEXT,
    centroid    TEXT,   -- JSON: {energy, valence, danceability, tempo, acousticness}
    status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'ended'
    track_queue TEXT,   -- JSON array of pre-fetched track dicts
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

ALTER TABLE interaction_log ADD COLUMN session_id TEXT;
