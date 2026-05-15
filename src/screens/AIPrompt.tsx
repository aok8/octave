/**
 * AIPrompt screen — AI Playlist Generation (OpenRouter + Ollama).
 *
 * Acceptance criteria covered:
 *   S9 — Mode A: Configure API key or use local Ollama
 *   S9 — Mode B: Prompt textarea, generate, loading state, track list, export, change key
 *   S9 — On mount restore saved key via get_ai_status IPC
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedTrack {
  id: string;
  name: string;
  artist_names: string[];
  album_name?: string;
  album_art_url?: string | null;
}

// ── AIPrompt screen ───────────────────────────────────────────────────────────

const MAX_CHARS = 500;

export function AIPrompt() {
  const [aiKey, setAiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tracks, setTracks] = useState<GeneratedTrack[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Restore previously saved key on mount
  useEffect(() => {
    invoke<string | null>("get_ai_status")
      .then((status) => {
        if (status && status.length > 0) {
          setAiKey(status);
        }
      })
      .catch(() => {
        // No key saved — stay in Mode A
      });
  }, []);

  async function handleSaveKey() {
    const trimmed = keyInput.trim();
    try {
      await invoke("set_ai_key", { key: trimmed });
      setAiKey(trimmed);
    } catch {
      // If IPC fails still set local state so user can proceed
      setAiKey(trimmed);
    }
  }

  async function handleUseLocal() {
    try {
      await invoke("set_ai_key", { key: "" });
    } catch {
      // Non-fatal
    }
    setAiKey("local");
  }

  async function handleGenerate() {
    if (!prompt.trim() || !aiKey) return;
    setGenerating(true);
    setError(null);
    setTracks([]);
    try {
      const result = await invoke<GeneratedTrack[]>("generate_ai_playlist", {
        prompt: prompt.trim(),
        aiKey,
      });
      setTracks(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate playlist. Try again."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleExport() {
    try {
      await invoke("export_playlist", { tracks, aiKey });
    } catch {
      // Export errors are non-fatal
    }
  }

  // ── Mode A — No key configured ────────────────────────────────────────────

  if (!aiKey) {
    return (
      <div
        data-testid="ai-prompt-screen"
        style={{
          padding: 32,
          background: "#121212",
          minHeight: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Heading */}
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#ffffff",
                margin: "0 0 8px",
                letterSpacing: "-0.3px",
              }}
            >
              AI Playlist Generation
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.55)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Generate playlists from a natural language prompt using OpenRouter
              or a local Ollama model.
            </p>
          </div>

          {/* API key input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              OpenRouter API Key
            </label>
            <input
              data-testid="ai-key-input"
              aria-label="OpenRouter API key"
              type="password"
              placeholder="sk-or-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyInput.trim()) handleSaveKey();
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                color: "#ffffff",
                fontSize: 14,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              data-testid="ai-key-save-btn"
              onClick={handleSaveKey}
              disabled={!keyInput.trim()}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: keyInput.trim() ? "#1DB9FF" : "rgba(29,185,255,0.20)",
                color: keyInput.trim() ? "#000" : "rgba(255,255,255,0.30)",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: keyInput.trim() ? "pointer" : "not-allowed",
                alignSelf: "flex-start",
              }}
            >
              Save Key
            </button>
          </div>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>or</span>
            <div style={{ flex: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }} />
          </div>

          {/* Local model option */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0 }}>
              Or run Ollama locally — no key needed.
            </p>
            <button
              data-testid="ai-use-local-btn"
              onClick={handleUseLocal}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              Use Local Model
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Mode B — Key configured ───────────────────────────────────────────────

  return (
    <div
      data-testid="ai-prompt-screen"
      style={{
        padding: 32,
        background: "#121212",
        minHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 600,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#ffffff",
              margin: "0 0 4px",
              letterSpacing: "-0.3px",
            }}
          >
            AI Playlist Generation
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            {aiKey === "local" ? "Using local Ollama model." : "Using OpenRouter API."}
          </p>
        </div>
        <button
          data-testid="ai-change-key-btn"
          onClick={() => {
            setAiKey(null);
            setKeyInput("");
            setTracks([]);
            setError(null);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.40)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            padding: "4px 0",
            textDecoration: "underline",
            flexShrink: 0,
          }}
        >
          Change key
        </button>
      </div>

      {/* Prompt textarea */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <textarea
          data-testid="ai-prompt-input"
          aria-label="AI prompt input"
          placeholder="Describe the playlist you want to generate…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
          rows={5}
          disabled={generating}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            color: generating ? "rgba(255,255,255,0.40)" : "#ffffff",
            fontSize: 14,
            padding: "12px 16px",
            fontFamily: "inherit",
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            cursor: generating ? "not-allowed" : "text",
          }}
        />
        {/* Character counter */}
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.35)",
            alignSelf: "flex-end",
          }}
        >
          {prompt.length} / {MAX_CHARS}
        </span>
      </div>

      {/* Generate button */}
      <button
        data-testid="ai-prompt-submit"
        onClick={handleGenerate}
        disabled={!prompt.trim() || generating}
        style={{
          padding: "12px 32px",
          borderRadius: 8,
          border: "none",
          background:
            !prompt.trim() || generating
              ? "rgba(29,185,255,0.20)"
              : "#1DB9FF",
          color: !prompt.trim() || generating ? "rgba(255,255,255,0.30)" : "#000",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: !prompt.trim() || generating ? "not-allowed" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        Generate Playlist
      </button>

      {/* Loading state */}
      {generating && (
        <div data-testid="ai-generating">
          <LoadingState type="list" rows={5} />
        </div>
      )}

      {/* Error state */}
      {error && !generating && (
        <ErrorState message={error} onRetry={handleGenerate} />
      )}

      {/* Generated track list */}
      {!generating && tracks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            Generated Tracks ({tracks.length})
          </h2>

          <div
            data-testid="ai-track-list"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            {tracks.map((track) => (
              <div
                key={track.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 14,
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
                      fontSize: 12,
                      color: "rgba(255,255,255,0.50)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.artist_names.join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Export button */}
          <button
            data-testid="ai-export-btn"
            onClick={handleExport}
            style={{
              padding: "11px 24px",
              borderRadius: 8,
              border: "none",
              background: "#1DB9FF",
              color: "#000",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Export to Spotify
          </button>
        </div>
      )}
    </div>
  );
}

export default AIPrompt;
