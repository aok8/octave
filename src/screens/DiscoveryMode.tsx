/**
 * DiscoveryMode screen — swipe-card discovery session.
 *
 * Acceptance criteria covered:
 *   S8 — Discovery Mode: swipe cards, keyboard nav, queue drawer, export
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveryTrack {
  id: string;
  name: string;
  artist_names: string[];
  album_name: string;
  album_art_url: string | null;
  duration_ms: number;
}

export interface DiscoverySession {
  session_id: string;
  track: DiscoveryTrack | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DiscoveryModeProps {
  seedTrackId?: string;
  onBack?: () => void;
}

// ── DiscoveryMode screen ──────────────────────────────────────────────────────

export function DiscoveryMode({ seedTrackId, onBack }: DiscoveryModeProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<DiscoveryTrack | null>(null);
  const [keptTracks, setKeptTracks] = useState<DiscoveryTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [cardKey, setCardKey] = useState(0);

  // Start the discovery session on mount (only if seedTrackId is provided)
  useEffect(() => {
    if (!seedTrackId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<DiscoverySession>("start_discovery_session", {
      seed_track_id: seedTrackId,
    })
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.session_id);
        setCurrentTrack(session.track);
        if (!session.track) setSessionComplete(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to start discovery session."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seedTrackId]);

  // Send feedback (keep or skip) and advance to next track
  const sendFeedback = useCallback(
    async (action: "keep" | "skip") => {
      if (!sessionId || !currentTrack || loading) return;

      const trackBeingActedOn = currentTrack;

      setLoading(true);
      setError(null);

      try {
        const next = await invoke<DiscoverySession>("send_discovery_feedback", {
          session_id: sessionId,
          track_id: trackBeingActedOn.id,
          action,
        });

        if (action === "keep") {
          setKeptTracks((prev) => [...prev, trackBeingActedOn]);
        }

        setCurrentTrack(next.track);
        setCardKey((k) => k + 1);
        if (!next.track) setSessionComplete(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send feedback."
        );
      } finally {
        setLoading(false);
      }
    },
    [sessionId, currentTrack, loading]
  );

  const handleSkip = useCallback(() => sendFeedback("skip"), [sendFeedback]);
  const handleKeep = useCallback(() => sendFeedback("keep"), [sendFeedback]);

  // Track whether we have already called end_discovery_session to avoid double-fire
  const sessionEndedRef = useRef(false);

  // End session when all tracks are exhausted (normal completion)
  useEffect(() => {
    if (!sessionId || !sessionComplete || sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    invoke("end_discovery_session", { session_id: sessionId }).catch(() => {});
  }, [sessionId, sessionComplete]);

  // End session on unmount if the user navigates away before completion
  useEffect(() => {
    return () => {
      if (sessionId && !sessionEndedRef.current) {
        invoke("end_discovery_session", { session_id: sessionId }).catch(() => {});
      }
    };
  }, [sessionId]);

  // Keyboard shortcuts: ArrowLeft = skip, ArrowRight = keep
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") handleSkip();
      if (e.key === "ArrowRight") handleKeep();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSkip, handleKeep]);

  // Export kept tracks
  async function handleExport() {
    const ids = keptTracks.map((t) => t.id);
    try {
      await invoke("start_discovery_export", {
        track_ids: ids,
        name: "Octave Discovery",
      });
    } catch {
      // Export errors are non-fatal; toast feedback could be added later
    }
  }

  // ── No seed track placeholder ─────────────────────────────────────────────
  if (!seedTrackId) {
    return (
      <div
        role="main"
        data-testid="discovery-mode-screen"
        style={{
          padding: 32,
          background: "#121212",
          minHeight: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.40)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Select a seed track to begin
        </p>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              marginTop: 24,
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !currentTrack) {
    return (
      <div
        role="main"
        data-testid="discovery-mode-screen"
        style={{
          padding: 32,
          background: "#121212",
          minHeight: "100%",
          boxSizing: "border-box",
        }}
      >
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div
      role="main"
      data-testid="discovery-mode-screen"
      style={{
        padding: 32,
        background: "#121212",
        minHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        gap: 32,
      }}
    >
      {/* ── Main card area ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: "0 0 4px",
              letterSpacing: "-0.3px",
            }}
          >
            Discovery Mode
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            Keep the tracks you love, skip the rest.
          </p>
        </div>

        {/* Track card or session complete */}
        {loading ? (
          <LoadingState type="track" />
        ) : sessionComplete || !currentTrack ? (
          /* Session complete state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              padding: 40,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#fff",
                margin: 0,
              }}
            >
              No more tracks. Session complete.
            </p>
            <p
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.55)",
                margin: 0,
              }}
            >
              {keptTracks.length} track{keptTracks.length !== 1 ? "s" : ""} kept
            </p>
            {keptTracks.length > 0 && (
              <button
                data-testid="discovery-export-btn"
                onClick={handleExport}
                style={{
                  padding: "12px 28px",
                  borderRadius: 8,
                  border: "none",
                  background: "#1DB9FF",
                  color: "#000",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "opacity 150ms ease",
                }}
              >
                Export to Playlist
              </button>
            )}
          </div>
        ) : (
          /* Track card with animation */
          <AnimatePresence mode="wait">
            <motion.div
              key={cardKey}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: 32,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                width: 320,
                maxWidth: "100%",
              }}
            >
              {/* Album art */}
              {currentTrack.album_art_url ? (
                <img
                  src={currentTrack.album_art_url}
                  alt={`${currentTrack.album_name} cover`}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 8,
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}

              {/* Track info */}
              <div style={{ textAlign: "center" }}>
                <p
                  data-testid="discovery-track-name"
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#fff",
                    margin: "0 0 6px",
                    letterSpacing: "-0.2px",
                  }}
                >
                  {currentTrack.name}
                </p>
                <p
                  data-testid="discovery-track-artist"
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.60)",
                    margin: "0 0 4px",
                  }}
                >
                  {currentTrack.artist_names.join(", ")}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.35)",
                    margin: 0,
                  }}
                >
                  {currentTrack.album_name}
                </p>
              </div>

              {/* Audio similarity hint */}
              <div
                data-testid="discovery-feature-hint"
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.35)",
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                Matched by audio similarity
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Action buttons */}
        {!sessionComplete && currentTrack && !loading && (
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <button
              data-testid="discovery-skip-btn"
              onClick={handleSkip}
              aria-label="Skip track"
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.70)",
                fontSize: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 150ms ease",
                fontFamily: "inherit",
              }}
            >
              ←
            </button>

            <button
              data-testid="discovery-keep-btn"
              onClick={handleKeep}
              aria-label="Keep track"
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "none",
                background: "#1DB9FF",
                color: "#000",
                fontSize: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 150ms ease",
                fontFamily: "inherit",
              }}
            >
              →
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>
          ← Skip &nbsp;·&nbsp; Keep →
        </p>
      </div>

      {/* ── Queue drawer (right side) ───────────────────────────────────────── */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          display: "flex",
          flexDirection: "column",
          gap: 12,
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
          Discovered (
          <span data-testid="discovery-queue-count">{keptTracks.length}</span>)
        </h2>

        <div
          data-testid="discovery-queue-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
            flex: 1,
          }}
        >
          {keptTracks.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", margin: 0 }}>
              No tracks kept yet.
            </p>
          ) : (
            keptTracks.map((track) => (
              <div
                key={track.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    margin: "0 0 2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.name}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.45)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.artist_names.join(", ")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default DiscoveryMode;
