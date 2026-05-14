/**
 * Settings screen — Spotify account, storage management, and app info.
 */

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── Mock user data ────────────────────────────────────────────────────────────

const MOCK_USER = { id: "u1", display_name: "Alain K.", email: "aokouassi@gmail.com" };

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

export function Settings() {
  const [logoutSuccess, setLogoutSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleLogout() {
    try {
      await invoke("logout");
      setLogoutSuccess(true);
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
      <div data-testid="settings-account-section" style={sectionStyle}>
        <p style={sectionLabelStyle}>Spotify Account</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
            {MOCK_USER.display_name}
          </span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            {MOCK_USER.email}
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
      <div data-testid="settings-storage-section" style={sectionStyle}>
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

      {/* ── App Info section ────────────────────────────────────────────────── */}
      <div data-testid="settings-app-info" style={sectionStyle}>
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
