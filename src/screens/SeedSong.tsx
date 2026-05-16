import { useState, useEffect, useRef } from "react";
import { invoke } from "../utils/invoke";
import { TrackCard } from "../components/TrackCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import type { Track, SimilarTrack } from "../types";

// Raw snake_case shape returned by the IPC command
interface SimilarTrackRaw {
  track_id: string;
  score: number;
  matching_features: string[];
}

function mapSimilarTrack(r: SimilarTrackRaw): SimilarTrack {
  return {
    trackId: r.track_id,
    score: r.score,
    matchingFeatures: r.matching_features,
  };
}

// ── SeedSong screen ───────────────────────────────────────────────────────────

interface SeedSongProps {
  onBack?: () => void;
  onDiscover?: (trackId: string) => void;
}

export function SeedSong({ onBack, onDiscover }: SeedSongProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  const [similarTracks, setSimilarTracks] = useState<SimilarTrack[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search — 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const data = await invoke<Track[]>("search_tracks", { query: query.trim() });
        setSearchResults(data);
      } catch {
        setSearchError("Search failed. Check your connection and try again.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleTrackSelect(track: Track) {
    setSelectedTrack(track);
    setRecsLoading(true);
    setRecsError(null);
    setRecommendations([]);
    setSimilarTracks([]);
    setSimilarLoading(true);

    // Fire both fetches in parallel
    const [recsResult, similarResult] = await Promise.allSettled([
      invoke<Track[]>("fetch_recommendations", { seedTrackId: track.id }),
      invoke<SimilarTrackRaw[]>("fetch_similar_tracks", { trackId: track.id }),
    ]);

    if (recsResult.status === "fulfilled") {
      setRecommendations(recsResult.value);
    } else {
      setRecsError("Could not fetch recommendations. Try again.");
    }

    if (similarResult.status === "fulfilled" && Array.isArray(similarResult.value)) {
      setSimilarTracks(similarResult.value.map(mapSimilarTrack));
    }
    // On failure (or non-array response) we silently show empty state — DB may be sparse

    setRecsLoading(false);
    setSimilarLoading(false);
  }

  return (
    <div
      role="main"
      style={{
        padding: 32,
        background: "#121212",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: 18,
              fontFamily: "inherit",
              borderRadius: 6,
            }}
            aria-label="Go back"
          >
            ←
          </button>
        )}
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.3px",
            }}
          >
            Seed Song
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "4px 0 0" }}>
            Search a track and discover music in its orbit.
          </p>
        </div>
      </div>

      {/* ── Search input ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, position: "relative", maxWidth: 480 }}>
        <input
          type="text"
          placeholder="Search for a track or artist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tracks"
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            color: "#ffffff",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.28)";
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)";
          }}
        />
        {searchLoading && (
          <div
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 14,
              height: 14,
              border: "2px solid rgba(255,255,255,0.15)",
              borderTopColor: "rgba(255,255,255,0.6)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
        )}
      </div>

      {/* ── Search results ────────────────────────────────────────────────── */}
      {searchError ? (
        <ErrorState message={searchError} onRetry={() => setQuery(query)} />
      ) : searchLoading ? (
        <LoadingState type="list" rows={4} />
      ) : searchResults.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.40)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 12px",
            }}
          >
            Results
          </h2>
          <div>
            {searchResults.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onClick={() => handleTrackSelect(track)}
              />
            ))}
          </div>
        </section>
      ) : query.trim() && !searchLoading ? (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          No results for "{query}".
        </p>
      ) : null}

      {/* ── Recommendations for selected track ───────────────────────────── */}
      {selectedTrack && (
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              Because you picked: {selectedTrack.name}
            </h2>
            <button
              onClick={() => {
                setSelectedTrack(null);
                setRecommendations([]);
                setSimilarTracks([]);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.35)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                padding: "2px 6px",
              }}
            >
              Clear
            </button>
          </div>

          {recsLoading ? (
            <LoadingState type="list" rows={6} />
          ) : recsError ? (
            <ErrorState
              message={recsError}
              onRetry={() => handleTrackSelect(selectedTrack)}
            />
          ) : recommendations.length === 0 ? (
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              No recommendations found for this track.
            </p>
          ) : (
            <div>
              {recommendations.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          )}

          {/* ── Similar Tracks section ──────────────────────────────────── */}
          <div style={{ marginTop: 28 }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 12px",
              }}
            >
              Similar Tracks
            </h2>

            {similarLoading ? (
              <LoadingState type="list" rows={3} />
            ) : similarTracks.length === 0 ? (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                No similar tracks found — try loading more playlists first.
              </p>
            ) : (
              <div>
                {similarTracks.map((sim) => (
                  <div
                    key={sim.trackId}
                    data-testid={`similar-track-${sim.trackId}`}
                    style={{ marginBottom: 4 }}
                  >
                    {/* Score label sits above the card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 12,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.30)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {(sim.score * 100).toFixed(0)}% match
                      </span>
                    </div>

                    <TrackCard
                      track={{
                        id: sim.trackId,
                        name: sim.trackId,
                        artistNames: [],
                        popularity: 0,
                      }}
                    />

                    {/* Feature chips */}
                    {sim.matchingFeatures.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          paddingLeft: 70,
                          marginTop: 4,
                          marginBottom: 6,
                        }}
                      >
                        {sim.matchingFeatures.map((feature) => (
                          <span
                            key={feature}
                            data-testid={`why-chip-${feature}`}
                            style={{
                              background: "rgba(29,185,255,0.12)",
                              border: "1px solid rgba(29,185,255,0.25)",
                              borderRadius: 4,
                              padding: "2px 7px",
                              fontSize: 11,
                              color: "#1DB9FF",
                              fontFamily: "inherit",
                            }}
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discover button — shown when track is selected and not loading */}
          {!recsLoading && !recsError && onDiscover && (
            <div style={{ marginTop: 20 }}>
              <button
                data-testid="seed-song-discover-btn"
                onClick={() => onDiscover(selectedTrack.id)}
                style={{
                  padding: "11px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#1DB9FF",
                  color: "#000",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Discover from this track
              </button>
            </div>
          )}
        </section>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}

export default SeedSong;
