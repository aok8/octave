import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TrackCard } from "../components/TrackCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { DonutChart } from "../charts/DonutChart";
import { FlowChart } from "../charts/FlowChart";
import type { Track, AudioFeatures } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenreDataPoint {
  genre: string;
  count: number;
  color: string;
}

interface FlowDataPoint {
  position: number;
  energy: number;
  valence: number;
  danceability: number;
}

interface InsightsData {
  genreBreakdown: GenreDataPoint[];
  audioFlow: FlowDataPoint[];
  tracks: Track[];
}

// ── Genre color palette (from requirements §6) ────────────────────────────────

const GENRE_PALETTE: Record<string, string> = {
  "R&B": "#6A0DAD",
  "Neo-Soul": "#FF914D",
  "Hip-Hop": "#1DB9FF",
  "Chill Pop": "#FF6FAE",
  "Lo-Fi": "#4DB6AC",
  "Nu-Jazz": "#FFD93D",
  Other: "#555555",
};

// ── Insights screen ───────────────────────────────────────────────────────────

interface InsightsProps {
  playlistId: string;
  onBack?: () => void;
}

export function Insights({ playlistId, onBack }: InsightsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures[]>([]);

  useEffect(() => {
    if (playlistId) {
      loadInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  async function loadInsights() {
    setLoading(true);
    setError(null);
    try {
      // Fetch insights (added by Agent B — wrapped in try/catch)
      let data: InsightsData | null = null;
      try {
        data = await invoke<InsightsData>("fetch_insights", { playlistId });
      } catch {
        // fetch_insights may not exist yet — fall through to audio features fallback
      }

      // Fetch audio features for tracks
      if (trackIds.length > 0) {
        try {
          const features = await invoke<AudioFeatures[]>("fetch_audio_features", { trackIds });
          setAudioFeatures(features);
        } catch {
          // Audio features are supplemental — non-fatal
        }
      }

      if (data) {
        setInsightsData(data);
      } else {
        // Provide empty-state data so charts can still render
        setInsightsData({
          genreBreakdown: buildDefaultGenreData(),
          audioFlow: [],
          tracks: [],
        });
      }
    } catch (err) {
      setError("Could not load insights. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function buildDefaultGenreData(): GenreDataPoint[] {
    return Object.entries(GENRE_PALETTE).map(([genre, color]) => ({
      genre,
      count: 0,
      color,
    }));
  }

  const hasGenreData =
    insightsData?.genreBreakdown?.some((d) => d.count > 0) ?? false;

  const hasFlowData =
    Array.isArray(insightsData?.audioFlow) && insightsData!.audioFlow.length > 0;

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
      {/* ── Header ──────────────────────────────────────────────────────── */}
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

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingState type="chart" />
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
          {/* ── Left: charts ──────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Genre donut */}
            <section>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.40)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 16px",
                }}
              >
                Genre Breakdown
              </h2>
              {hasGenreData ? (
                <DonutChart data={insightsData!.genreBreakdown} />
              ) : (
                <div
                  style={{
                    height: 260,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.25)",
                    fontSize: 13,
                    border: "1px dashed rgba(255,255,255,0.10)",
                    borderRadius: 8,
                  }}
                >
                  Genre data unavailable
                </div>
              )}
            </section>

            {/* Audio flow */}
            <section>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.40)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 16px",
                }}
              >
                Audio Flow
              </h2>
              {hasFlowData ? (
                <FlowChart data={insightsData!.audioFlow} />
              ) : (
                <div
                  style={{
                    height: 200,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.25)",
                    fontSize: 13,
                    border: "1px dashed rgba(255,255,255,0.10)",
                    borderRadius: 8,
                  }}
                >
                  Audio flow data unavailable
                </div>
              )}
            </section>
          </div>

          {/* ── Right: track list ─────────────────────────────────────────── */}
          <section>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 16px",
              }}
            >
              Tracks
            </h2>
            {insightsData?.tracks && insightsData.tracks.length > 0 ? (
              <div
                style={{
                  maxHeight: 520,
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {insightsData.tracks.map((track) => {
                  const features = audioFeatures.find((f) => f.trackId === track.id);
                  return (
                    <TrackCard key={track.id} track={track} features={features} />
                  );
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
