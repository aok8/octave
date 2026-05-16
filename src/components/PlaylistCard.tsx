import { useState } from "react";
import { motion } from "framer-motion";
import type { Playlist } from "../types";

// ── Fallback gradient ─────────────────────────────────────────────────────────

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #6A0DAD 0%, #1DB9FF 100%)",
  "linear-gradient(135deg, #FF914D 0%, #FFD93D 100%)",
  "linear-gradient(135deg, #4DB6AC 0%, #6A0DAD 100%)",
  "linear-gradient(135deg, #FF6FAE 0%, #FF914D 100%)",
  "linear-gradient(135deg, #1DB9FF 0%, #4DB6AC 100%)",
  "linear-gradient(135deg, #FFD93D 0%, #FF6FAE 100%)",
];

function gradientForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

// ── Timestamp formatter ───────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  // ts is Unix seconds from the sidecar; Date.now() is ms
  const diffMs = Date.now() - ts * 1000;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PlaylistCardProps {
  playlist: Playlist;
  onClick?: () => void;
}

export function PlaylistCard({ playlist, onClick }: PlaylistCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "border-color 150ms ease",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.20)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)";
      }}
    >
      {/* Cover art */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          flexShrink: 0,
          overflow: "hidden",
          background: gradientForId(playlist.id),
        }}
      >
        {playlist.coverUrl && !imgError && (
          <img
            src={playlist.coverUrl}
            alt={playlist.name}
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#ffffff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {playlist.name}
        </div>
        {playlist.trackCount > 0 && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.60)",
              marginTop: 4,
            }}
          >
            {playlist.trackCount} tracks
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default PlaylistCard;
