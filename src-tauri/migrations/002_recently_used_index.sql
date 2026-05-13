CREATE INDEX IF NOT EXISTS idx_recently_used_accessed ON recently_used(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_log_type ON interaction_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_features_cached ON audio_features(cached_at);
INSERT OR IGNORE INTO schema_version (version) VALUES (2);
