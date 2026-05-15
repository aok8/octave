import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LoginProps {
  onAuthenticated: () => void;
}

export function Login({ onAuthenticated }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shows a nudge after 30 s of waiting so the user knows what to do
  const [waitTooLong, setWaitTooLong] = useState(false);

  // Stores the active cleanup fn so the Cancel button can call it
  const cancelRef = useRef<(() => void) | null>(null);

  // Start / clear the 30-second hint timer whenever loading changes
  useEffect(() => {
    if (!loading) {
      setWaitTooLong(false);
      return;
    }
    const t = setTimeout(() => setWaitTooLong(true), 30_000);
    return () => clearTimeout(t);
  }, [loading]);

  function cancelAuth() {
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
    setError(null);
  }

  async function handleConnect() {
    const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
    if (!clientId) {
      setError("VITE_SPOTIFY_CLIENT_ID is not set. Add it to your .env.local file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await invoke("start_oauth", { clientId });

      // Primary signal: Rust deep-link handler emits "oauth-complete" once
      // tokens are stored. Fires as soon as Spotify redirects back.
      let unlistenComplete: (() => void) | null = null;
      let unlistenError: (() => void) | null = null;

      const cleanup = () => {
        unlistenComplete?.();
        unlistenError?.();
        clearInterval(poll);
        clearTimeout(timeout);
        cancelRef.current = null;
      };

      // Expose cleanup so the Cancel button can call it
      cancelRef.current = () => {
        cleanup();
        setLoading(false);
        setError(null);
      };

      unlistenComplete = await listen<void>("oauth-complete", () => {
        cleanup();
        onAuthenticated();
      });

      unlistenError = await listen<string>("oauth-error", (event) => {
        cleanup();
        setLoading(false);
        setError(event.payload ?? "Spotify login failed. Please try again.");
      });

      // Fallback poll — catches the case where the event is missed
      // (e.g. window was backgrounded when the deep-link fired)
      const poll = setInterval(async () => {
        try {
          const state = await invoke<{ is_authenticated: boolean }>("get_auth_state");
          if (state.is_authenticated) {
            cleanup();
            onAuthenticated();
          }
        } catch {
          // Ignore transient errors during polling
        }
      }, 1000);

      // Hard timeout after 5 minutes
      const timeout = setTimeout(() => {
        cleanup();
        setLoading(false);
        setError("Authentication timed out. Please try again.");
      }, 300_000);
    } catch (err) {
      cancelRef.current = null;
      setError("Could not open Spotify login. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      role="main"
      aria-label="Login"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#121212",
        fontFamily: "Inter, system-ui, sans-serif",
        gap: 0,
      }}
    >
      {/* Logo mark */}
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #1DB9FF 0%, #6A0DAD 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
          fontSize: 28,
          fontWeight: 800,
          color: "#fff",
          letterSpacing: "-1px",
        }}
      >
        ♩
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "#ffffff",
          margin: "0 0 8px",
          letterSpacing: "-0.5px",
        }}
      >
        Octave
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.45)",
          margin: "0 0 48px",
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        Playlist curation with fine-tuned control. Connect your Spotify account to get started.
      </p>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: 13,
            color: "#ff6b6b",
            background: "rgba(255,107,107,0.10)",
            border: "1px solid rgba(255,107,107,0.25)",
            borderRadius: 8,
            padding: "10px 16px",
            margin: "0 0 24px",
            maxWidth: 360,
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleConnect}
        disabled={loading}
        aria-label={loading ? "Opening Spotify…" : "Connect Spotify"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 32px",
          background: loading ? "rgba(29,185,84,0.5)" : "#1DB954",
          border: "none",
          borderRadius: 50,
          color: "#000000",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s, transform 0.1s",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
        }}
        onMouseLeave={(e) => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
        }}
      >
        {/* Spotify logo mark */}
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        {loading ? "Waiting for Spotify…" : "Connect Spotify"}
      </button>

      {/* Controls shown while waiting */}
      {loading && (
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          {waitTooLong && (
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                margin: 0,
                textAlign: "center",
                maxWidth: 300,
              }}
            >
              Taking longer than expected? Make sure you clicked{" "}
              <strong style={{ color: "rgba(255,255,255,0.7)" }}>Agree</strong>{" "}
              on the Spotify page and that Octave is set as the default handler
              for the <code style={{ fontSize: 12 }}>octave://</code> link.
            </p>
          )}
          <button
            onClick={cancelAuth}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              padding: "4px 8px",
              textDecoration: "underline",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <p
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.20)",
          marginTop: 32,
          textAlign: "center",
          maxWidth: 300,
          lineHeight: 1.6,
        }}
      >
        Your data stays on your device. Octave only reads your library and audio features — it never posts without your action.
      </p>
    </div>
  );
}

export default Login;
