/**
 * AIPrompt screen — placeholder for the AI Playlist Generation feature (V2).
 */

import React from "react";

export function AIPrompt() {
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
        gap: 20,
        textAlign: "center",
      }}
    >
      {/* Lock icon */}
      <span style={{ fontSize: 48, lineHeight: 1 }}>🔒</span>

      {/* Heading */}
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#ffffff",
          margin: 0,
          letterSpacing: "-0.3px",
        }}
      >
        AI Playlist Generation
      </h1>

      {/* Coming Soon badge */}
      <span
        data-testid="ai-prompt-badge"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(255,255,255,0.20)",
          borderRadius: 6,
          padding: "3px 10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Coming Soon
      </span>

      {/* Disabled prompt textarea */}
      <textarea
        data-testid="ai-prompt-input"
        disabled
        placeholder="Describe the playlist you want to generate…"
        rows={5}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 10,
          color: "rgba(255,255,255,0.25)",
          fontSize: 14,
          padding: "12px 16px",
          fontFamily: "inherit",
          outline: "none",
          resize: "none",
          cursor: "not-allowed",
          boxSizing: "border-box",
        }}
      />

      {/* Disabled submit button */}
      <button
        data-testid="ai-prompt-submit"
        disabled
        style={{
          padding: "12px 32px",
          borderRadius: 10,
          border: "none",
          background: "rgba(29,185,255,0.20)",
          color: "rgba(255,255,255,0.30)",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "not-allowed",
        }}
      >
        Generate Playlist
      </button>

      {/* Subtext */}
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.35)",
          margin: 0,
          maxWidth: 360,
        }}
      >
        AI features are coming in Octave V2
      </p>
    </div>
  );
}

export default AIPrompt;
