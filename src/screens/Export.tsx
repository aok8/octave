/**
 * Export screen — standalone wrapper re-exporting the ExportModal logic
 * for use as a full screen when navigated to directly.
 *
 * The primary Export UI lives inline in Refinement.tsx as ExportModal.
 * This file exposes a standalone page-level component for routing purposes.
 */

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorState } from "../components/ErrorState";
import { mockPlaylists } from "../mocks";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExportProps {
  /** Track IDs to export */
  trackIds?: string[];
  /** Source playlist ID — used to pre-fill name */
  playlistId?: string;
  /** Called when modal/screen is dismissed */
  onClose?: () => void;
  /** Called on successful export */
  onSuccess?: () => void;
}

// ── Export screen ─────────────────────────────────────────────────────────────

export function Export({
  trackIds = [],
  playlistId,
  onClose,
  onSuccess,
}: ExportProps) {
  const playlist = mockPlaylists.find((p) => p.id === playlistId);
  const defaultName = playlist ? `${playlist.name} — Refined` : "My Playlist — Refined";

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"new" | "overwrite">("new");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    mockPlaylists[0]?.id ?? ""
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleExport() {
    // Validation
    if (!name.trim()) {
      setNameError("Playlist name cannot be empty.");
      return;
    }
    if (name.length > 100) {
      setNameError("Playlist name must be 100 characters or fewer.");
      return;
    }
    if (trackIds.length === 0) {
      setExportError("No tracks to export. Go back and adjust your filters.");
      return;
    }

    setNameError(null);
    setExportError(null);
    setIsExporting(true);

    try {
      await invoke("export_playlist", {
        mode,
        playlistId: mode === "overwrite" ? selectedPlaylistId : undefined,
        name: name.trim(),
        description: description.trim(),
        trackIds,
      });
      setSuccess(true);
      onSuccess?.();
      setTimeout(() => onClose?.(), 1500);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed. Please try again."
      );
    } finally {
      setIsExporting(false);
    }
  }

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
        gap: 28,
        maxWidth: 540,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Go back"
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
            Export to Spotify
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: "4px 0 0" }}>
            {trackIds.length} track{trackIds.length !== 1 ? "s" : ""} selected
          </p>
        </div>
      </div>

      {success ? (
        <div
          data-testid="export-success"
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "#28CA41",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          Playlist exported to Spotify ✓
        </div>
      ) : (
        <>
          {/* Mode toggle */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 10px",
              }}
            >
              Export mode
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {(["new", "overwrite"] as const).map((m) => (
                <button
                  key={m}
                  data-testid={`export-mode-${m}`}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: `1px solid ${mode === m ? "#1DB9FF" : "rgba(255,255,255,0.12)"}`,
                    background:
                      mode === m ? "rgba(29,185,255,0.10)" : "transparent",
                    color:
                      mode === m ? "#1DB9FF" : "rgba(255,255,255,0.55)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "inherit",
                    fontWeight: mode === m ? 600 : 400,
                    transition: "all 150ms ease",
                  }}
                >
                  {m === "new" ? "Create new playlist" : "Overwrite existing"}
                </button>
              ))}
            </div>
          </div>

          {/* Playlist name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="export-playlist-name"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Playlist name
            </label>
            <input
              id="export-playlist-name"
              data-testid="export-name-input"
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${nameError ? "#FF5757" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                padding: "10px 14px",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                width: "100%",
                transition: "border-color 150ms ease",
              }}
            />
            {nameError && (
              <span
                data-testid="export-name-error"
                style={{ fontSize: 12, color: "#FF5757" }}
              >
                {nameError}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="export-description"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Description</span>
              <span style={{ fontWeight: 400, textTransform: "none" }}>
                {description.length}/300
              </span>
            </label>
            <textarea
              id="export-description"
              data-testid="export-description-input"
              value={description}
              maxLength={300}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this refined playlist…"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#fff",
                fontSize: 13,
                padding: "10px 14px",
                fontFamily: "inherit",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                width: "100%",
              }}
            />
          </div>

          {/* Overwrite selector */}
          {mode === "overwrite" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="export-playlist-select"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.40)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Select playlist to overwrite
              </label>
              <select
                id="export-playlist-select"
                data-testid="export-playlist-select"
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  padding: "10px 14px",
                  fontFamily: "inherit",
                  outline: "none",
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                {mockPlaylists.map((pl) => (
                  <option
                    key={pl.id}
                    value={pl.id}
                    style={{ background: "#1a1a1a" }}
                  >
                    {pl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error state */}
          {exportError && (
            <ErrorState message={exportError} />
          )}

          {/* Confirm button */}
          <button
            data-testid="export-confirm-button"
            onClick={handleExport}
            disabled={isExporting}
            style={{
              width: "100%",
              padding: "13px 0",
              borderRadius: 10,
              border: "none",
              background: isExporting
                ? "rgba(29,185,255,0.35)"
                : "linear-gradient(135deg, #1DB9FF, #6A0DAD)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: isExporting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxShadow: isExporting ? "none" : "0 0 24px rgba(29,185,255,0.40)",
              transition: "all 150ms ease",
            }}
          >
            {isExporting ? "Exporting…" : "Export to Spotify"}
          </button>
        </>
      )}
    </div>
  );
}

export default Export;
