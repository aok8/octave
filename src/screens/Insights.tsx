import React, { useState, useEffect, useRef } from "react";
import { invoke } from "../utils/invoke";
import { TrackCard } from "../components/TrackCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { DonutChart } from "../charts/DonutChart";
import { FlowChart } from "../charts/FlowChart";
import { TempoMap } from "../charts/TempoMap";
import { KeyChart } from "../charts/KeyChart";
import type { Track, AudioFeatures } from "../types";

// ── Types matching the Python /insights API response ─────────────────────────

interface GenreBreakdownEntry {
  genre: string;
  count: number;
  color: string;
  subgenres: string[];
}

interface TimelineEntry {
  position: number;
  track_id: string;
  track_name?: string;
  artist_names?: string[];
  album_art_url?: string;
  energy: number | null;
  valence: number | null;
  danceability: number | null;
  tempo: number | null;
  popularity: number | null;
  key: string | null;
  genre: string;
  features_source?: "synthetic" | "rapidapi" | "spotify";
}

interface InsightsResponse {
  playlist_id: string;
  genre_breakdown: GenreBreakdownEntry[];
  timeline: TimelineEntry[];
  total_tracks: number;
  key_distribution: Record<string, number>;
  synthetic_fraction: number;
  /** True when a RapidAPI key is saved in settings. */
  rapidapi_configured: boolean;
}

// ── Insights screen ───────────────────────────────────────────────────────────

interface InsightsProps {
  playlistId: string;
  onBack?: () => void;
  onRefine?: () => void;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.40)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 16px",
};

const EMPTY_CARD: React.CSSProperties = {
  height: 160,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255,255,255,0.25)",
  fontSize: 13,
  border: "1px dashed rgba(255,255,255,0.10)",
  borderRadius: 8,
};

// Chunk size matches RapidAPI's 5 req/s rate limit — each chunk fires 5
// parallel requests, then we wait 1 s before sending the next chunk.
const RAPIDAPI_CHUNK_SIZE = 5;
const RAPIDAPI_CHUNK_DELAY_MS = 1000;

export function Insights({ playlistId, onBack, onRefine }: InsightsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures[]>([]);
  // Progress state for the background audio-feature fetch
  const [fetchedCount, setFetchedCount] = useState(0);
  const [totalToFetch, setTotalToFetch] = useState(0);

  // Guard against React Strict Mode's double-invocation of useEffect in
  // development.  Without this, two identical chunk loops fire simultaneously,
  // doubling the RapidAPI request rate and triggering 429s on every chunk.
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (playlistId) loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  async function loadInsights() {
    if (fetchingRef.current) return; // already in progress — skip duplicate
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    setFetchedCount(0);
    setTotalToFetch(0);
    try {
      // Step 1 — fetch insights immediately (fast: reads whatever is in the
      // DB cache).  Show charts right away even if features are synthetic.
      const data = await invoke<InsightsResponse>("fetch_insights", { playlistId });
      setInsights(data);
      setLoading(false);

      // Step 2 — fetch audio features in background, 5 tracks per chunk to
      // stay within the RapidAPI 5 req/s rate limit.  Refresh insights after
      // every chunk so charts update progressively as data arrives.
      const trackIds = data.timeline.map((t) => t.track_id);
      if (trackIds.length === 0) return;

      setTotalToFetch(trackIds.length);

      const chunks: string[][] = [];
      for (let i = 0; i < trackIds.length; i += RAPIDAPI_CHUNK_SIZE) {
        chunks.push(trackIds.slice(i, i + RAPIDAPI_CHUNK_SIZE));
      }

      let accumulated: AudioFeatures[] = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        try {
          const chunkFeatures = await invoke<AudioFeatures[]>("fetch_audio_features", {
            trackIds: chunks[ci],
          });
          accumulated = [...accumulated, ...chunkFeatures];
          setAudioFeatures([...accumulated]);
          setFetchedCount(Math.min((ci + 1) * RAPIDAPI_CHUNK_SIZE, trackIds.length));

          // Refresh insights so charts reflect features now in the DB
          const refreshed = await invoke<InsightsResponse>("fetch_insights", { playlistId });
          setInsights(refreshed);
        } catch {
          // non-fatal — keep going with remaining chunks
        }

        // Rate-limit delay between chunks (skip after the last one)
        if (ci < chunks.length - 1) {
          await new Promise<void>((res) => setTimeout(res, RAPIDAPI_CHUNK_DELAY_MS));
        }
      }

      // Final refresh to capture any DB writes that landed after the loop
      setFetchedCount(trackIds.length);
      setTotalToFetch(0); // hides the progress banner
    } catch (err) {
      setError("Could not load insights. Check your connection and try again.");
      setLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }

  // Derived data for charts
  const genreData = insights?.genre_breakdown ?? [];
  const hasGenreData = genreData.some((d) => d.count > 0);

  const flowData = (insights?.timeline ?? []).map((t) => ({
    position: t.position,
    energy: t.energy ?? 0,
    valence: t.valence ?? 0,
    danceability: t.danceability ?? 0,
  }));

  const tempoData = (insights?.timeline ?? []).map((t) => ({
    position: t.position,
    tempo: t.tempo,
  }));
  const hasTempoData = tempoData.some((d) => d.tempo != null);

  const keyDistribution = insights?.key_distribution ?? {};
  const hasKeyData = Object.keys(keyDistribution).length > 0;

  return (
    <div
      role="main"
      style={{
        padding: 32,
        background: "#121212",
        minHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              Playlist Insights
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "4px 0 0" }}>
              Audio DNA of your playlist
            </p>
          </div>
        </div>
        {onRefine && (
          <button
            onClick={onRefine}
            aria-label="Refine playlist"
            style={{
              background: "#1DB9FF",
              border: "none",
              borderRadius: 6,
              color: "#000",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              padding: "8px 16px",
            }}
          >
            Refine Playlist →
          </button>
        )}
      </div>

      {/* ── Audio analysis progress banner ──────────────────────────────────── */}
      {!loading && !error && totalToFetch > 0 && (
        <div
          data-testid="insights-fetch-progress"
          style={{
            background: "rgba(29,185,255,0.08)",
            border: "1px solid rgba(29,185,255,0.25)",
            color: "#1DB9FF",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: "50%",
              border: "2px solid rgba(29,185,255,0.3)",
              borderTopColor: "#1DB9FF",
              animation: "spin 0.9s linear infinite",
            }}
          />
          Analyzing audio… {fetchedCount} / {totalToFetch} tracks — charts update as data arrives
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Synthetic data notice ───────────────────────────────────────────── */}
      {!loading && !error && totalToFetch === 0 && insights && (insights.synthetic_fraction ?? 0) > 0 && (
        <div
          data-testid="insights-synthetic-notice"
          style={{
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.3)",
            color: "#fbbf24",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {insights.rapidapi_configured
            ? /* Key is set — these tracks just aren't in SoundNet's catalog */
              insights.synthetic_fraction === 1.0
              ? "Audio features are estimated — these tracks aren't in the SoundNet catalog yet."
              : `Some tracks (${Math.round(insights.synthetic_fraction * insights.total_tracks)}) use estimated audio features — not found in the SoundNet catalog.`
            : /* No key configured — prompt to add one */
              insights.synthetic_fraction === 1.0
              ? "Audio features are estimated — add a RapidAPI key in Settings for full analysis."
              : `Some tracks (${Math.round(insights.synthetic_fraction * insights.total_tracks)}) use estimated audio features. Add a RapidAPI key in Settings.`}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <LoadingState type="chart" />
          <LoadingState type="list" rows={5} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadInsights} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 32,
            alignItems: "start",
          }}
        >
          {/* ── Left: charts ─────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Genre donut */}
            <section aria-label="Genre breakdown">
              <h2 style={SECTION_LABEL}>Genre Breakdown</h2>
              {hasGenreData ? (
                <DonutChart data={genreData} />
              ) : (
                <div style={EMPTY_CARD}>Genre data unavailable</div>
              )}
            </section>

            {/* Audio flow */}
            <section aria-label="Audio flow">
              <h2 style={SECTION_LABEL}>Audio Flow</h2>
              {flowData.length > 0 ? (
                <FlowChart data={flowData} />
              ) : (
                <div style={EMPTY_CARD}>Audio flow data unavailable</div>
              )}
            </section>

            {/* Tempo map */}
            <section aria-label="Tempo map">
              <h2 style={SECTION_LABEL}>Tempo Map</h2>
              {hasTempoData ? (
                <TempoMap data={tempoData} />
              ) : (
                <div style={{ ...EMPTY_CARD, height: 100 }}>Tempo data unavailable</div>
              )}
            </section>

            {/* Key distribution */}
            <section aria-label="Key distribution">
              <h2 style={SECTION_LABEL}>Key Distribution</h2>
              {hasKeyData ? (
                <KeyChart data={keyDistribution} />
              ) : (
                <div style={{ ...EMPTY_CARD, height: 100 }}>Key data unavailable</div>
              )}
            </section>
          </div>

          {/* ── Right: track list ───────────────────────────────────────────── */}
          <section aria-label="Tracks">
            <h2 style={SECTION_LABEL}>Tracks</h2>
            {insights && insights.timeline.length > 0 ? (
              <div style={{ maxHeight: 720, overflowY: "auto", paddingRight: 4 }}>
                {insights.timeline.map((t) => {
                  const features = audioFeatures.find((f) => f.trackId === t.track_id);
                  // Minimal Track shape for TrackCard
                  const track: Track = {
                    id: t.track_id,
                    name: t.track_name ?? t.track_id,
                    artistNames: t.artist_names ?? [],
                    albumArtUrl: t.album_art_url,
                    popularity: t.popularity ?? 0,
                  };
                  return <TrackCard key={t.track_id} track={track} features={features} />;
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                No tracks available for this playlist.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Insights;
