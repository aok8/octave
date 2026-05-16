import { useState, useEffect } from "react";
import { invoke } from "./utils/invoke";
import { AppShell } from "./layouts/AppShell";
import { Login } from "./screens/Login";
import Home from "./screens/Home";
import { SeedPlaylist } from "./screens/SeedPlaylist";
import { SeedSong } from "./screens/SeedSong";
import { Insights } from "./screens/Insights";
import { Refinement } from "./screens/Refinement";
import { Export } from "./screens/Export";
import { Settings } from "./screens/Settings";
import { AIPrompt } from "./screens/AIPrompt";
import { DiscoveryMode } from "./screens/DiscoveryMode";

// ── Navigation state ──────────────────────────────────────────────────────────

type Screen =
  | { id: "loading" }
  | { id: "login" }
  | { id: "home" }
  | { id: "seed-playlist" }
  | { id: "seed-song" }
  | { id: "insights"; playlistId: string }
  | { id: "refinement"; playlistId: string }
  | { id: "export"; trackIds: string[]; playlistId: string }
  | { id: "ai-prompt" }
  | { id: "discover"; seedTrackId?: string }
  | { id: "settings" };

// Map Screen.id → the AppShell nav tab that should appear active
type NavId = "home" | "library" | "create" | "ai-prompt" | "discover" | "settings";

function navIdForScreen(screen: Screen): NavId {
  switch (screen.id) {
    case "seed-playlist":
    case "insights":
    case "refinement":
    case "export":
      return "library";
    case "seed-song":
      return "create";
    case "ai-prompt":
      return "ai-prompt";
    case "discover":
      return "discover";
    case "settings":
      return "settings";
    default:
      return "home";
  }
}

// ── Loading splash ────────────────────────────────────────────────────────────

function LoadingSplash() {
  return (
    <div
      aria-label="Loading"
      aria-busy="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#121212",
        color: "rgba(255,255,255,0.30)",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
        letterSpacing: "0.05em",
      }}
    >
      Loading…
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: "loading" });

  // Redirect to login on Spotify token expiry (fired by utils/invoke.ts)
  useEffect(() => {
    const handler = () => setScreen({ id: "login" });
    window.addEventListener("octave-auth-expired", handler);
    return () => window.removeEventListener("octave-auth-expired", handler);
  }, []);

  // Check auth state on mount
  useEffect(() => {
    invoke<{ is_authenticated: boolean }>("get_auth_state")
      .then((state) => {
        setScreen(state.is_authenticated ? { id: "home" } : { id: "login" });
      })
      .catch(() => {
        // If IPC fails (e.g. dev without Tauri), fall through to login
        setScreen({ id: "login" });
      });
  }, []);

  if (screen.id === "loading") return <LoadingSplash />;
  if (screen.id === "login") {
    return (
      <Login onAuthenticated={() => setScreen({ id: "home" })} />
    );
  }

  // ── Sidebar nav click → top-level screen change ──────────────────────────
  function handleNavChange(navId: string) {
    switch (navId) {
      case "home":        setScreen({ id: "home" }); break;
      case "library":     setScreen({ id: "seed-playlist" }); break;
      case "create":      setScreen({ id: "seed-song" }); break;
      case "ai-prompt":   setScreen({ id: "ai-prompt" }); break;
      case "discover":    setScreen({ id: "discover" }); break;
      case "settings":    setScreen({ id: "settings" }); break;
    }
  }

  // ── Screen renderer ───────────────────────────────────────────────────────
  function renderScreen() {
    switch (screen.id) {
      case "home":
        return (
          <Home
            onNavigate={(dest) => {
              if (dest === "seed-playlist") setScreen({ id: "seed-playlist" });
              else if (dest === "seed-song") setScreen({ id: "seed-song" });
              else if (dest === "discover") setScreen({ id: "discover" });
            }}
          />
        );

      case "seed-playlist":
        return (
          <SeedPlaylist
            onBack={() => setScreen({ id: "home" })}
            onAnalyze={(playlistId) => setScreen({ id: "insights", playlistId })}
          />
        );

      case "seed-song":
        return (
          <SeedSong
            onDiscover={(seedTrackId) => setScreen({ id: "discover", seedTrackId })}
          />
        );

      case "insights":
        return (
          <Insights
            playlistId={screen.playlistId}
            onBack={() => setScreen({ id: "seed-playlist" })}
            // onRefine temporarily disabled — Spotify deprecated the audio-features
            // API so the Refinement screen cannot produce meaningful recommendations.
            // Restore once an alternative recommendations source is integrated.
          />
        );

      case "refinement":
        return (
          <Refinement
            playlistId={screen.playlistId}
            onBack={() => setScreen({ id: "insights", playlistId: screen.playlistId })}
            onExport={(trackIds) =>
              setScreen({ id: "export", trackIds, playlistId: screen.playlistId })
            }
          />
        );

      case "export":
        return (
          <Export
            trackIds={screen.trackIds}
            playlistId={screen.playlistId}
            onClose={() => setScreen({ id: "refinement", playlistId: screen.playlistId })}
            onSuccess={() => setScreen({ id: "home" })}
          />
        );

      case "ai-prompt":
        return <AIPrompt />;

      case "discover":
        return <DiscoveryMode seedTrackId={screen.seedTrackId} />;

      case "settings":
        return <Settings onLogout={() => setScreen({ id: "login" })} />;

      default:
        return null;
    }
  }

  return (
    <AppShell
      activeNav={navIdForScreen(screen)}
      onNavChange={handleNavChange}
    >
      {renderScreen()}
    </AppShell>
  );
}
