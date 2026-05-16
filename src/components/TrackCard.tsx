import { useState } from "react";
import type { Track, AudioFeatures, GenreBucket } from "../types";
import { GenreChip } from "./GenreChip";

// ── Audio feature dot config ─────────────────────────────────────────────────

interface FeatureDot {
  key: keyof AudioFeatures;
  color: string;
  label: string;
}

const FEATURE_DOTS: FeatureDot[] = [
  { key: "energy", color: "#FF914D", label: "Energy" },
  { key: "danceability", color: "#FF6FAE", label: "Dance" },
  { key: "tempo", color: "#4DB6AC", label: "Tempo" },
  { key: "valence", color: "#FFD93D", label: "Valence" },
  { key: "acousticness", color: "#1DB9FF", label: "Acoustic" },
];

/** Normalize tempo (60–200 BPM) to 0–1 range, clamp others. */
function normalizeValue(key: keyof AudioFeatures, raw: number): number {
  if (key === "tempo") return Math.min(1, Math.max(0, (raw - 60) / 140));
  return Math.min(1, Math.max(0, raw));
}

// ── Duration formatter ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ── Fallback album art gradient ───────────────────────────────────────────────

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #6A0DAD, #1DB9FF)",
  "linear-gradient(135deg, #FF914D, #FFD93D)",
  "linear-gradient(135deg, #4DB6AC, #6A0DAD)",
  "linear-gradient(135deg, #FF6FAE, #FF914D)",
];

function gradientForId(id: string | null): string {
  if (!id) return FALLBACK_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TrackCardProps {
  track: Track;
  features?: AudioFeatures;
  /** Alias for features — accepted for test compatibility */
  audioFeatures?: AudioFeatures;
  genres?: GenreBucket[];
  onClick?: () => void;
}

export function TrackCard({ track, features, audioFeatures, genres, onClick }: TrackCardProps) {
  const resolvedFeatures = features ?? audioFeatures;
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isLocal = track.isLocal === true;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={isLocal ? undefined : onClick}
      onKeyDown={(e) => !isLocal && e.key === "Enter" && onClick?.()}
      onMouseEnter={() => !isLocal && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 8,
        cursor: isLocal ? "default" : onClick ? "pointer" : "default",
        background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
        transition: "background 150ms ease",
        width: "100%",
        boxSizing: "border-box",
        opacity: isLocal ? 0.45 : 1,
      }}
    >
      {/* Row 1: art + text + duration */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Album art */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            flexShrink: 0,
            overflow: "hidden",
            background: gradientForId(track.id),
          }}
        >
          {track.albumArtUrl && !imgError && (
            <img
              src={track.albumArtUrl}
              alt={track.albumName ?? track.name}
              onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )}
        </div>

        {/* Title + artist */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              color: "#ffffff",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {track.name}
            </span>
            {isLocal && (
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  border: "1px solid rgba(255,255,255,0.20)",
                  borderRadius: 3,
                  padding: "1px 5px",
                  flexShrink: 0,
                  fontWeight: 400,
                }}
              >
                Local
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.60)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {track.artistNames.join(", ")}
          </div>
        </div>

        {/* Duration */}
        {track.durationMs != null && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.35)",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatDuration(track.durationMs)}
          </div>
        )}
      </div>

      {/* Row 2: genre chips */}
      {genres && genres.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 58 }}>
          {genres.map((g) => (
            <GenreChip key={g} genre={g} />
          ))}
        </div>
      )}

      {/* Row 3: audio feature bars */}
      {resolvedFeatures && (
        <div
          className="audio-feature"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 3,
            paddingLeft: 58,
            height: 16,
          }}
        >
          {FEATURE_DOTS.map(({ key, color, label }) => {
            const raw = resolvedFeatures[key] as number | undefined;
            if (raw == null) return null;
            const norm = normalizeValue(key, raw);
            const barH = Math.round(4 + norm * 12); // 4–16 px
            return (
              <div
                key={key}
                data-testid="audio-feature-bar"
                title={`${label}: ${key === "tempo" ? Math.round(raw) + " BPM" : norm.toFixed(2)}`}
                style={{
                  width: 4,
                  height: barH,
                  borderRadius: 2,
                  background: color,
                  alignSelf: "flex-end",
                  transition: "height 150ms ease",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TrackCard;
