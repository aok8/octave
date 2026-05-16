/**
 * Settings screen — Spotify account, storage management, and app info.
 */

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UserProfile {
  display_name: string;
  email: string;
}

// ── Shared section styles ─────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "20px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.40)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: 0,
};

const actionBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "background 150ms ease",
  alignSelf: "flex-start",
};

const toastStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#28CA41",
  fontWeight: 500,
};

const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#FF5757",
  fontWeight: 500,
};

// ── Settings screen ───────────────────────────────────────────────────────────

interface SettingsProps {
  onLogout?: () => void;
}

export function Settings({ onLogout }: SettingsProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [logoutSuccess, setLogoutSuccess] = useState(false);

  // RapidAPI Audio Features state
  const [rapidApiKey, setRapidApiKey] = useState("");
  const [rapidApiStatus, setRapidApiStatus] = useState<{ configured: boolean; source: string } | null>(null);
  const [rapidApiTestResult, setRapidApiTestResult] = useState<{ ok: boolean; error: string | null } | null>(null);
  const [rapidApiSaving, setRapidApiSaving] = useState(false);
  const [rapidApiTesting, setRapidApiTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    invoke<UserProfile>("get_user_profile").then(setUser).catch(() => {});
    invoke<{ configured: boolean; source: string }>("get_rapidapi_status")
      .then(setRapidApiStatus)
      .catch(() => {});
  }, []);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleLogout() {
    try {
      await invoke("logout");
      setLogoutSuccess(true);
      onLogout?.();
    } catch (err) {
      // Swallow — success banner only shown on success
    }
  }

  async function handleExportDb() {
    setExportSuccess(false);
    setExportError(null);
    try {
      await invoke("export_db", { path: "octave-backup.db" });
      setExportSuccess(true);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed. Please try again."
      );
    }
  }

  async function handleImportDb() {
    setImportSuccess(false);
    setImportError(null);
    try {
      await invoke("import_db", { path: "octave-import.db", mode: "merge" });
      setImportSuccess(true);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Import failed. Please try again."
      );
    }
  }

  async function handleSaveRapidApiKey() {
    setRapidApiSaving(true);
    setRapidApiTestResult(null);
    try {
      await invoke("save_rapidapi_key", { key: rapidApiKey });
      const status = await invoke<{ configured: boolean; source: string }>("get_rapidapi_status");
      setRapidApiStatus(status);
    } catch {
      // swallow — status chip stays unchanged
    } finally {
      setRapidApiSaving(false);
    }
  }

  async function handleTestRapidApiKey() {
    setRapidApiTesting(true);
    setRapidApiTestResult(null);
    try {
      const result = await invoke<{ ok: boolean; error: string | null }>("test_rapidapi_key", { key: rapidApiKey });
      setRapidApiTestResult(result);
    } catch (err) {
      setRapidApiTestResult({ ok: false, error: err instanceof Error ? err.message : "Test failed." });
    } finally {
      setRapidApiTesting(false);
    }
  }

  async function handleDeleteRapidApiKey() {
    try {
      await invoke("delete_rapidapi_key");
      setRapidApiKey("");
      const status = await invoke<{ configured: boolean; source: string }>("get_rapidapi_status");
      setRapidApiStatus(status);
      setRapidApiTestResult(null);
    } catch {
      // swallow
    }
  }

  return (
    <div
      style={{
        padding: 32,
        background: "#121212",
        minHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        maxWidth: 560,
      }}
    >
      {/* Header */}
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
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
          Manage your account, storage, and app preferences.
        </p>
      </div>

      {/* ── Spotify Account section ─────────────────────────────────────────── */}
      <div data-testid="settings-account-section" role="region" aria-label="Spotify Account" style={sectionStyle}>
        <p style={sectionLabelStyle}>Spotify Account</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
            {user?.display_name ?? "—"}
          </span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            {user?.email ?? ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            data-testid="settings-logout-btn"
            onClick={handleLogout}
            style={{
              ...actionBtnStyle,
              border: "1px solid rgba(255,87,87,0.40)",
              background: "rgba(255,87,87,0.08)",
              color: "#FF5757",
            }}
          >
            Logout
          </button>
          {logoutSuccess && (
            <span data-testid="settings-logout-success" style={toastStyle}>
              Logged out successfully.
            </span>
          )}
        </div>
      </div>

      {/* ── Storage section ─────────────────────────────────────────────────── */}
      <div data-testid="settings-storage-section" role="region" aria-label="Storage" style={sectionStyle}>
        <p style={sectionLabelStyle}>Storage</p>

        {/* Export DB */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            Export a snapshot of your local database for backup.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              data-testid="settings-export-db-btn"
              onClick={handleExportDb}
              style={actionBtnStyle}
            >
              Export Database
            </button>
            {exportSuccess && (
              <span data-testid="settings-export-success" style={toastStyle}>
                Database exported successfully.
              </span>
            )}
            {exportError && (
              <span style={errorStyle}>{exportError}</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }}
        />

        {/* Import DB */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            Merge an exported database file into your current data.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              data-testid="settings-import-db-btn"
              onClick={handleImportDb}
              style={actionBtnStyle}
            >
              Import Database
            </button>
            {importSuccess && (
              <span data-testid="settings-import-success" style={toastStyle}>
                Database imported successfully.
              </span>
            )}
            {importError && (
              <span style={errorStyle}>{importError}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Provider section ─────────────────────────────────────────────── */}
      <div
        data-testid="settings-ai-status"
        role="region"
        aria-label="AI provider status"
        style={sectionStyle}
      >
        <p style={sectionLabelStyle}>AI Provider</p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span
            data-testid="settings-ai-openrouter-chip"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 12,
              color: "rgba(255,255,255,0.40)",
            }}
          >
            OpenRouter
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                display: "inline-block",
              }}
            />
            Offline
          </span>

          <span
            data-testid="settings-ai-ollama-chip"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 12,
              color: "rgba(255,255,255,0.40)",
            }}
          >
            Local (Ollama)
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                display: "inline-block",
              }}
            />
            Offline
          </span>
        </div>

        <p
          data-testid="settings-ai-configure-link"
          style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: 0 }}
        >
          Configure your API key in the AI Prompt screen.
        </p>
      </div>

      {/* ── Audio Features section ──────────────────────────────────────────── */}
      <div
        data-testid="settings-audio-features-section"
        role="region"
        aria-label="Audio Features"
        style={sectionStyle}
      >
        <p style={sectionLabelStyle}>Audio Features</p>

        {/* RapidAPI Key input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>RapidAPI Key</span>
            {/* Status chip */}
            {rapidApiStatus ? (
              <span
                data-testid="settings-rapidapi-status-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  ...(rapidApiStatus.source === "rapidapi"
                    ? { background: "rgba(40,202,65,0.12)", color: "#28CA41", border: "1px solid rgba(40,202,65,0.30)" }
                    : rapidApiStatus.source === "synthetic"
                    ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.12)" }
                    : { background: "rgba(255,217,61,0.10)", color: "#FFD93D", border: "1px solid rgba(255,217,61,0.30)" }),
                }}
              >
                {rapidApiStatus.source === "rapidapi"
                  ? "RapidAPI"
                  : rapidApiStatus.source === "synthetic"
                  ? "Synthetic"
                  : "Not configured"}
              </span>
            ) : (
              <span
                data-testid="settings-rapidapi-status-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(255,217,61,0.10)",
                  color: "#FFD93D",
                  border: "1px solid rgba(255,217,61,0.30)",
                }}
              >
                Not configured
              </span>
            )}
          </div>

          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
            Powers audio analysis charts (energy, tempo, danceability). Get a key at{" "}
            <span style={{ color: "rgba(255,255,255,0.65)" }}>
              rapidapi.com/soundnet-soundnet-default/api/track-analysis
            </span>
          </span>

          {/* Key input with show/hide toggle */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              data-testid="settings-rapidapi-key-input"
              type={showKey ? "text" : "password"}
              placeholder="Paste your RapidAPI key…"
              value={rapidApiKey}
              onChange={(e) => setRapidApiKey(e.target.value)}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              data-testid="settings-rapidapi-show-key-btn"
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? "Hide key" : "Show key"}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
                fontFamily: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Action buttons row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            data-testid="settings-rapidapi-test-btn"
            onClick={handleTestRapidApiKey}
            disabled={rapidApiTesting || !rapidApiKey.trim()}
            style={{
              ...actionBtnStyle,
              opacity: rapidApiTesting || !rapidApiKey.trim() ? 0.5 : 1,
            }}
          >
            {rapidApiTesting ? "Testing…" : "Test Key"}
          </button>

          <button
            data-testid="settings-rapidapi-save-btn"
            onClick={handleSaveRapidApiKey}
            disabled={rapidApiSaving || !rapidApiKey.trim()}
            style={{
              ...actionBtnStyle,
              background: rapidApiSaving || !rapidApiKey.trim() ? "rgba(29,185,255,0.15)" : "rgba(29,185,255,0.20)",
              border: "1px solid rgba(29,185,255,0.35)",
              color: "#1DB9FF",
              opacity: rapidApiSaving || !rapidApiKey.trim() ? 0.6 : 1,
            }}
          >
            {rapidApiSaving ? "Saving…" : "Save Key"}
          </button>

          {/* Test result inline */}
          {rapidApiTestResult && (
            <span
              data-testid="settings-rapidapi-test-result"
              style={rapidApiTestResult.ok ? toastStyle : errorStyle}
            >
              {rapidApiTestResult.ok
                ? "✓ Key valid"
                : rapidApiTestResult.error ?? "Key invalid"}
            </span>
          )}
        </div>

        {/* Remove key link — only visible when configured */}
        {rapidApiStatus?.configured && (
          <button
            data-testid="settings-rapidapi-remove-btn"
            onClick={handleDeleteRapidApiKey}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#FF5757",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              alignSelf: "flex-start",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Remove Key
          </button>
        )}
      </div>

      {/* ── App Info section ────────────────────────────────────────────────── */}
      <div data-testid="settings-app-info" role="region" aria-label="App Info" style={sectionStyle}>
        <p style={sectionLabelStyle}>App Info</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", width: 80 }}>App</span>
            <span style={{ fontSize: 13, color: "#fff" }}>Octave</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", width: 80 }}>Version</span>
            <span style={{ fontSize: 13, color: "#fff" }}>0.5.0</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", width: 80 }}>License</span>
            <span style={{ fontSize: 13, color: "#fff" }}>MIT</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
