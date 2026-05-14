-- Add named index on interaction_log for faster event_type + created_at queries.
-- The index in migration 002 covers the same columns; this migration adds a
-- canonically-named alias so queries can reference it explicitly.
CREATE INDEX IF NOT EXISTS idx_interaction_log_event_type_created_at
    ON interaction_log(event_type, created_at);
INSERT OR IGNORE INTO schema_version (version) VALUES (3);
