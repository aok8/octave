import React, { useState, useEffect } from "react";
import { invoke } from "../utils/invoke";
import { AnimatePresence, motion } from "framer-motion";
import { PlaylistCard } from "../components/PlaylistCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import type { Playlist } from "../types";
import { normalizePlaylist } from "../lib/normalize";

// ── Taglines ──────────────────────────────────────────────────────────────────

const TAGLINES = [
  "Expand your sound.",
  "Beyond the same old recommendations.",
  "Find your octave.",
];

// ── Creation card types ───────────────────────────────────────────────────────

interface CreationCard {
  id: "seed-playlist" | "seed-song" | "ai-prompt" | "discovery";
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function PlaylistIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
    </svg>
  );
}

function SongIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 10.12h-6.78l2.74-2.82-2.82-2.83C13.21 3.55 12.11 3 11 3c-1.11 0-2.21.55-3.14 1.47L5.36 6.97 4 5.61 2.61 7l1.36 1.36-1.46 1.47L3.88 11.2l1.47-1.47L8 12.38l-2.05 2.04C5.58 14.76 5.2 15.37 5 16H3v2h2c0 1.06.42 2.08 1.17 2.83C6.92 21.58 7.94 22 9 22s2.08-.42 2.83-1.17L14 18.66l1.36 1.36L16.72 18.66 15.36 17.3l1.95-1.95L15.62 13.66l-1.94 1.94-2.69-2.69 6.44-.05L21 10.12zm-9 9.71c-.56.56-1.31.83-2.09.74-.62-.08-1.21-.39-1.65-.83-.56-.56-.86-1.29-.86-2.09 0-.79.31-1.54.86-2.09l1.76-1.76 4.07 4.07-2.09 2.09v.87z" />
    </svg>
  );
}

function DiscoveryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13l-1 5.5 5.5-1-1-5.5L10 7zm1 6c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
    </svg>
  );
}

// ── Home screen ───────────────────────────────────────────────────────────────

interface HomeProps {
  onNavigate?: (screen: "seed-playlist" | "seed-song" | "discover") => void;
}

export function Home({ onNavigate }: HomeProps) {
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [recentPlaylists, setRecentPlaylists] = useState<Playlist[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  // Rotate taglines every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineIndex((i) => (i + 1) % TAGLINES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recently used playlists from IPC on mount
  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(null);
    invoke<unknown[]>("get_recently_used")
      .then((data) => {
        if (!cancelled) setRecentPlaylists(data.map(normalizePlaylist));
      })
      .catch(() => {
        if (!cancelled) {
          setRecentPlaylists([]);
          setRecentError("Could not load recently used playlists.");
        }
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const CREATION_CARDS: CreationCard[] = [
    {
      id: "seed-playlist",
      title: "Seed Playlist",
      description: "Pick a playlist and expand its sound with smart recommendations.",
      icon: <PlaylistIcon />,
      onClick: () => onNavigate?.("seed-playlist"),
    },
    {
      id: "seed-song",
      title: "Seed Song",
      description: "Search for a track and discover music in its orbit.",
      icon: <SongIcon />,
      onClick: () => onNavigate?.("seed-song"),
    },
    {
      id: "ai-prompt",
      title: "AI Prompt",
      description: "Describe a vibe and let Octave build the playlist.",
      icon: <AIIcon />,
      disabled: true,
    },
    {
      id: "discovery",
      title: "Discovery Mode",
      description: "Explore tracks one by one and build a playlist from what you love.",
      icon: <DiscoveryIcon />,
      onClick: () => onNavigate?.("discover"),
    },
  ];

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
      {/* ── Hero section ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#ffffff",
            margin: "0 0 12px",
            letterSpacing: "-0.5px",
          }}
        >
          Octave
        </h1>

        {/* Rotating tagline */}
        <div style={{ height: 28, overflow: "hidden", position: "relative" }}>
          <AnimatePresence mode="wait">
            <motion.p
              key={taglineIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              data-testid="tagline"
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.55)",
                margin: 0,
                position: "absolute",
              }}
            >
              {TAGLINES[taglineIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Creation cards ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
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
          Create
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {CREATION_CARDS.map((card) => (
            <CreationCardItem key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* ── Recently used ────────────────────────────────────────────────── */}
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
          Recently Used
        </h2>

        {recentLoading ? (
          <LoadingState type="list" />
        ) : recentError ? (
          <ErrorState message={recentError} />
        ) : recentPlaylists.length === 0 ? (
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.30)",
              margin: 0,
            }}
          >
            No playlists used yet. Start by seeding one above.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 10,
            }}
          >
            {recentPlaylists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                onClick={() => onNavigate?.("seed-playlist")}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── CreationCardItem ──────────────────────────────────────────────────────────

function CreationCardItem({ card }: { card: CreationCard }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      data-testid={`creation-card-${card.id}`}
      onClick={card.disabled ? undefined : card.onClick}
      disabled={card.disabled}
      onMouseEnter={() => !card.disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-disabled={card.disabled}
      aria-label={card.title}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 20,
        borderRadius: 12,
        border: `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
        background: hovered
          ? "rgba(255,255,255,0.07)"
          : card.disabled
          ? "rgba(255,255,255,0.02)"
          : "rgba(255,255,255,0.04)",
        cursor: card.disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        transition: "all 150ms ease",
        fontFamily: "inherit",
        opacity: card.disabled ? 0.5 : 1,
      }}
    >
      <div style={{ color: card.disabled ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.70)" }}>
        {card.icon}
      </div>

      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: card.disabled ? "rgba(255,255,255,0.35)" : "#ffffff",
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {card.title}
          {card.disabled && (
            <span
              style={{
                fontSize: 10,
                border: "1px solid rgba(255,255,255,0.20)",
                borderRadius: 4,
                padding: "1px 6px",
                color: "rgba(255,255,255,0.30)",
              }}
            >
              Soon
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.40)",
            lineHeight: 1.5,
          }}
        >
          {card.description}
        </div>
      </div>
    </button>
  );
}

export default Home;
