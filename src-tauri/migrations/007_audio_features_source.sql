-- Add source column to audio_features so the cache layer can distinguish
-- real (rapidapi / spotify) entries from synthetic fallback values.
-- Existing rows default to 'synthetic' so they will be re-fetched on the
-- next audio-features request when a RapidAPI key is available.

ALTER TABLE audio_features ADD COLUMN source TEXT NOT NULL DEFAULT 'synthetic';
