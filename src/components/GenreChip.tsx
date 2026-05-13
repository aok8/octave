import React from "react";
import type { GenreBucket } from "../types";

// ── Genre color map ──────────────────────────────────────────────────────────

const GENRE_COLORS: Record<GenreBucket, string> = {
  rnb: "#6A0DAD",
  neosoul: "#FF914D",
  hiphop: "#1DB9FF",
  chillpop: "#FF6FAE",
  lofi: "#4DB6AC",
  nujazz: "#FFD93D",
  other: "#888888",
};

// ── Genre label humanizer ────────────────────────────────────────────────────

const GENRE_LABELS: Record<GenreBucket, string> = {
  rnb: "R&B",
  neosoul: "Neo Soul",
  hiphop: "Hip-Hop",
  chillpop: "Chill Pop",
  lofi: "Lo-Fi",
  nujazz: "Nu-Jazz",
  other: "Other",
};

// ── Component ────────────────────────────────────────────────────────────────

type ChipVariant = "default" | "boosted" | "excluded";

interface GenreChipProps {
  genre: GenreBucket;
  variant?: ChipVariant;
  onBoost?: () => void;
  onExclude?: () => void;
  showActions?: boolean;
}

export function GenreChip({
  genre,
  variant = "default",
  onBoost,
  onExclude,
  showActions = false,
}: GenreChipProps) {
  const color = variant === "excluded" ? "rgba(255,255,255,0.25)" : GENRE_COLORS[genre];

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 100,
    padding: "2px 8px",
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 150ms ease",
    border: `1px solid ${color}`,
    color: variant === "excluded" ? "rgba(255,255,255,0.25)" : color,
    background:
      variant === "boosted"
        ? `${GENRE_COLORS[genre]}40` // 25% opacity hex approx
        : "transparent",
    boxShadow:
      variant === "boosted"
        ? `0 0 8px ${GENRE_COLORS[genre]}60`
        : "none",
    textDecoration: variant === "excluded" ? "line-through" : "none",
  };

  return (
    <span style={baseStyle}>
      {GENRE_LABELS[genre]}
      {showActions && (
        <>
          {onBoost && variant !== "boosted" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBoost();
              }}
              title="Boost"
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 10,
                lineHeight: 1,
                opacity: 0.7,
              }}
            >
              ↑
            </button>
          )}
          {onExclude && variant !== "excluded" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExclude();
              }}
              title="Exclude"
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 10,
                lineHeight: 1,
                opacity: 0.7,
              }}
            >
              ✕
            </button>
          )}
        </>
      )}
    </span>
  );
}

export { GENRE_COLORS, GENRE_LABELS };
export type { ChipVariant };
