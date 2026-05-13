import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlaylistCard } from "../components/PlaylistCard";
import { TrackCard } from "../components/TrackCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import type { Playlist, Track } from "../types";

// ── SeedPlaylist screen ───────────────────────────────────────────────────────

interface SeedPlaylistProps {
  onBack?: () => void;
}

export function SeedPlaylist({ onBack }: SeedPlaylistProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<Playlist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);

  // Fetch playlists on mount
  useEffect(() => {
    fetchPlaylists();
  }, []);

  // Client-side filter on search query change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPlaylists(playlists);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredPlaylists(
        playlists.filter(
          (pl) =>
            pl.name.toLowerCase().includes(q) ||
            (pl.description ?? "").toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, playlists]);

  async function fetchPlaylists() {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<Playlist[]>("fetch_playlists");
      setPlaylists(data);
      setFilteredPlaylists(data);
    } catch (err) {
      setError("Could not load playlists. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlaylistClick(playlist: Playlist) {
    setSelectedPlaylist(playlist);
    setTracksLoading(true);
    setTracksError(null);
    setTracks([]);
    try {
      const data = await invoke<Track[]>("fetch_playlist_tracks", {
        playlistId: playlist.id,
      });
      setTracks(data);
    } catch (err) {
      setTracksError("Could not load tracks for this playlist.");
    } finally {
      setTracksLoading(false);
    }
  }

  return (
    <div
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
            Seed Playlist
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "4px 0 0" }}>
            Choose a playlist to expand its sound.
          </p>
        </div>
      </div>

      {/* ── Search input ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Filter playlists…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter playlists"
          style={{
            width: "100%",
            maxWidth: 420,
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
      </div>

      {/* ── Playlist grid ────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingState type="card" rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchPlaylists} />
      ) : filteredPlaylists.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          No playlists match your search.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
            marginBottom: selectedPlaylist ? 32 : 0,
          }}
        >
          {filteredPlaylists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              onClick={() => handlePlaylistClick(pl)}
            />
          ))}
        </div>
      )}

      {/* ── Track list for selected playlist ─────────────────────────────── */}
      {selectedPlaylist && (
        <div style={{ marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#ffffff", margin: 0 }}>
              {selectedPlaylist.name}
            </h2>
            <button
              onClick={() => {
                setSelectedPlaylist(null);
                setTracks([]);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.45)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                padding: "4px 8px",
              }}
            >
              Close
            </button>
          </div>

          {tracksLoading ? (
            <LoadingState type="list" rows={8} />
          ) : tracksError ? (
            <ErrorState
              message={tracksError}
              onRetry={() => handlePlaylistClick(selectedPlaylist)}
            />
          ) : tracks.length === 0 ? (
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              This playlist has no tracks.
            </p>
          ) : (
            <div>
              {tracks.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SeedPlaylist;
