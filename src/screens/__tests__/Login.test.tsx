/**
 * Tests for the Login screen.
 *
 * Acceptance criteria covered:
 *   AC-S15-01 — Login renders "Connect Spotify" button
 *   AC-S15-02 — clicking the button calls start_oauth with VITE_SPOTIFY_CLIENT_ID
 *   AC-S15-03 — polling get_auth_state calls onAuthenticated when authenticated
 *   AC-S15-04 — error is shown when CLIENT_ID is missing
 *   AC-S15-05 — error is shown when start_oauth rejects
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Login } from "../Login";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_SPOTIFY_CLIENT_ID", "test_client_id");
  mockInvoke.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Login screen", () => {
  it("renders the Octave heading", () => {
    render(<Login onAuthenticated={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /octave/i })).toBeInTheDocument();
  });

  it("renders the Connect Spotify button", () => {
    render(<Login onAuthenticated={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connect spotify/i })).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<Login onAuthenticated={vi.fn()} />);
    expect(screen.getByText(/playlist curation/i)).toBeInTheDocument();
  });

  it("shows an error when VITE_SPOTIFY_CLIENT_ID is not set", async () => {
    vi.stubEnv("VITE_SPOTIFY_CLIENT_ID", "");
    render(<Login onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(/VITE_SPOTIFY_CLIENT_ID/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls start_oauth with the client ID when button clicked", async () => {
    render(<Login onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});
    expect(mockInvoke).toHaveBeenCalledWith("start_oauth", { clientId: "test_client_id" });
  });

  it("button text changes to waiting state after click", async () => {
    render(<Login onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});
    expect(screen.getByText(/waiting for spotify/i)).toBeInTheDocument();
  });

  it("calls onAuthenticated when get_auth_state returns is_authenticated: true", async () => {
    const onAuthenticated = vi.fn();
    mockInvoke
      .mockResolvedValueOnce(undefined) // start_oauth
      .mockResolvedValue({ is_authenticated: true }); // get_auth_state polls

    render(<Login onAuthenticated={onAuthenticated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});

    // Advance 1s to fire the first poll interval
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {});

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("shows error when start_oauth rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("IPC error"));
    render(<Login onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(/could not open spotify login/i);
  });

  it("does not call onAuthenticated when is_authenticated is false", async () => {
    const onAuthenticated = vi.fn();
    mockInvoke
      .mockResolvedValueOnce(undefined) // start_oauth
      .mockResolvedValue({ is_authenticated: false }); // get_auth_state polls

    render(<Login onAuthenticated={onAuthenticated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect spotify/i }));
    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {});

    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
