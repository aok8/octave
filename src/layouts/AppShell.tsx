import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageTransition } from "./PageTransition";

// ── Nav item definition ──────────────────────────────────────────────────────

type NavId = "home" | "library" | "create" | "ai-prompt" | "settings";

interface NavItem {
  id: NavId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

// Inline SVG icons — no external dependency needed
function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
    </svg>
  );
}
function CreateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}
function AIPromptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "library", label: "Library", icon: <LibraryIcon /> },
  { id: "create", label: "Create", icon: <CreateIcon /> },
  { id: "ai-prompt", label: "AI Prompt", icon: <AIPromptIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

// ── Traffic light dots ────────────────────────────────────────────────────────

function TrafficLights() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#FF5F57",
          cursor: "default",
        }}
      />
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#FFBD2E",
          cursor: "default",
        }}
      />
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#28CA41",
          cursor: "default",
        }}
      />
    </div>
  );
}

// ── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  /** Controlled active nav id — if omitted, shell manages its own state */
  activeNav?: NavId;
  onNavChange?: (id: NavId) => void;
}

export function AppShell({ children, activeNav: controlledNav, onNavChange }: AppShellProps) {
  const [internalNav, setInternalNav] = useState<NavId>("home");
  const activeNav = controlledNav ?? internalNav;

  function handleNav(id: NavId, disabled?: boolean) {
    if (disabled) return;
    if (onNavChange) {
      onNavChange(id);
    } else {
      setInternalNav(id);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#121212",
        overflow: "hidden",
      }}
    >
      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      <div
        data-tauri-drag-region
        style={{
          height: 32,
          minHeight: 32,
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          userSelect: "none",
          WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
          flexShrink: 0,
        }}
      >
        <TrafficLights />
      </div>

      {/* ── Body: sidebar + main ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav
          aria-label="Main navigation"
          style={{
            width: 220,
            minWidth: 220,
            background: "rgba(255,255,255,0.03)",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 0",
            gap: 2,
            overflowY: "auto",
          }}
        >
          {/* App logo / wordmark */}
          <div
            style={{
              padding: "0 20px 16px",
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            Octave
          </div>

          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id, item.disabled)}
                disabled={item.disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none",
                  borderLeft: isActive ? "3px solid #1DB9FF" : "3px solid transparent",
                  color: item.disabled
                    ? "rgba(255,255,255,0.25)"
                    : isActive
                    ? "#ffffff"
                    : "rgba(255,255,255,0.60)",
                  cursor: item.disabled ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontFamily: "inherit",
                  transition: "all 150ms ease",
                  width: "100%",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled && !isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.disabled && !isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }
                }}
              >
                <span style={{ opacity: item.disabled ? 0.4 : 1 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.disabled && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.25)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 4,
                      padding: "1px 5px",
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Main content area */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNav}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              style={{ width: "100%", height: "100%" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export type { NavId };
