import React, { useEffect } from "react";

// ── Shimmer keyframes injected once ──────────────────────────────────────────

const SHIMMER_STYLE_ID = "octave-shimmer-styles";

function ensureShimmerStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes octave-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .octave-shimmer {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.06) 25%,
        rgba(255,255,255,0.12) 50%,
        rgba(255,255,255,0.06) 75%
      );
      background-size: 200% 100%;
      animation: octave-shimmer 1.6s ease-in-out infinite;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

// ── Shimmer primitive ─────────────────────────────────────────────────────────

function Shimmer({ width = "100%", height = 16, style }: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="octave-shimmer"
      style={{ width, height, borderRadius: 4, ...style }}
    />
  );
}

// ── List skeleton (TrackCard-shaped rows) ─────────────────────────────────────

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
          }}
        >
          {/* Album art */}
          <Shimmer width={48} height={48} style={{ borderRadius: 6, flexShrink: 0 }} />
          {/* Text block */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Shimmer width="60%" height={13} />
            <Shimmer width="40%" height={11} />
          </div>
          {/* Duration */}
          <Shimmer width={32} height={11} style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

// ── Card skeleton (PlaylistCard-shaped grid) ───────────────────────────────────

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Shimmer width={56} height={56} style={{ borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Shimmer width="70%" height={13} />
            <Shimmer width="50%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Chart skeleton ────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return <Shimmer width="100%" height={240} style={{ borderRadius: 8 }} />;
}

// ── LoadingState ──────────────────────────────────────────────────────────────

interface LoadingStateProps {
  rows?: number;
  type?: "list" | "card" | "chart";
}

export function LoadingState({ rows = 5, type = "list" }: LoadingStateProps) {
  useEffect(() => {
    ensureShimmerStyles();
  }, []);

  ensureShimmerStyles();

  return (
    <div style={{ padding: "8px 0", width: "100%" }}>
      {type === "list" && <ListSkeleton rows={rows} />}
      {type === "card" && <CardSkeleton rows={rows} />}
      {type === "chart" && <ChartSkeleton />}
    </div>
  );
}
