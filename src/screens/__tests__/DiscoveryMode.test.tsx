/**
 * Tests for the DiscoveryMode screen.
 *
 * Acceptance criteria covered:
 *   S8-A01 — Discovery screen renders with correct test IDs
 *   S8-A02 — Placeholder state when no seedTrackId
 *   S8-A03 — Calls start_discovery_session on mount
 *   S8-A04 — Renders track name and artist from session
 *   S8-A05 — Skip button calls send_discovery_feedback with action "skip"
 *   S8-A06 — Keep button calls send_discovery_feedback with action "keep"
 *   S8-A07 — Kept tracks appear in queue list
 *   S8-A08 — Export button appears when track is null (session complete)
 *   S8-A09 — ArrowRight keyboard shortcut triggers keep action
 */

import type { ReactNode, HTMLAttributes } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DiscoveryMode } from "../DiscoveryMode";

// Mock Framer Motion to avoid animation complexity in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) => (
      <p {...props}>{children}</p>
    ),
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TRACK = {
  id: "track-1",
  name: "Midnight Bloom",
  artist_names: ["Solar Wave"],
  album_name: "Cosmic Sessions",
  album_art_url: null,
  duration_ms: 210000,
};

const MOCK_TRACK_2 = {
  id: "track-2",
  name: "Neon Tide",
  artist_names: ["Echo Drift"],
  album_name: "Frequencies",
  album_art_url: null,
  duration_ms: 195000,
};

const MOCK_SESSION = {
  session_id: "session-abc",
  track: MOCK_TRACK,
};

const MOCK_SESSION_NEXT = {
  session_id: "session-abc",
  track: MOCK_TRACK_2,
};

const MOCK_SESSION_COMPLETE = {
  session_id: "session-abc",
  track: null,
};

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue(MOCK_SESSION);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DiscoveryMode screen", () => {
  it("1. renders the discovery screen container", () => {
    render(<DiscoveryMode />);
    expect(screen.getByTestId("discovery-mode-screen")).toBeInTheDocument();
  });

  it("2. shows placeholder state when no seedTrackId prop", () => {
    render(<DiscoveryMode />);
    expect(screen.getByText(/select a seed track to begin/i)).toBeInTheDocument();
  });

  it("3. calls invoke('start_discovery_session') on mount with a seedTrackId", async () => {
    render(<DiscoveryMode seedTrackId="track-seed-1" />);

    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("start_discovery_session", {
      seed_track_id: "track-seed-1",
    });
  });

  it("4. renders track name and artist when session starts", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_SESSION);

    render(<DiscoveryMode seedTrackId="track-seed-1" />);

    await act(async () => {});

    expect(screen.getByTestId("discovery-track-name")).toHaveTextContent("Midnight Bloom");
    expect(screen.getByTestId("discovery-track-artist")).toHaveTextContent("Solar Wave");
  });

  it("5. skip button calls invoke('send_discovery_feedback') with action 'skip'", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session
      .mockResolvedValueOnce(MOCK_SESSION_NEXT); // send_discovery_feedback

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    const skipBtn = screen.getByTestId("discovery-skip-btn");
    fireEvent.click(skipBtn);
    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("send_discovery_feedback", {
      session_id: "session-abc",
      track_id: "track-1",
      action: "skip",
    });
  });

  it("6. keep button calls invoke('send_discovery_feedback') with action 'keep'", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session
      .mockResolvedValueOnce(MOCK_SESSION_NEXT); // send_discovery_feedback

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    const keepBtn = screen.getByTestId("discovery-keep-btn");
    fireEvent.click(keepBtn);
    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("send_discovery_feedback", {
      session_id: "session-abc",
      track_id: "track-1",
      action: "keep",
    });
  });

  it("7. kept tracks appear in the queue list", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session
      .mockResolvedValueOnce(MOCK_SESSION_NEXT); // send_discovery_feedback (keep)

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    const keepBtn = screen.getByTestId("discovery-keep-btn");
    fireEvent.click(keepBtn);
    await act(async () => {});

    const queueList = screen.getByTestId("discovery-queue-list");
    expect(queueList).toHaveTextContent("Midnight Bloom");
    expect(screen.getByTestId("discovery-queue-count")).toHaveTextContent("1");
  });

  it("8. export button appears when track is null (session complete)", async () => {
    // After start, session is immediately complete (track: null)
    // But we need a kept track first for the export button to show
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session (has a track)
      .mockResolvedValueOnce(MOCK_SESSION_COMPLETE); // send_discovery_feedback → complete

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    // Keep the current track (triggers session complete on next)
    const keepBtn = screen.getByTestId("discovery-keep-btn");
    fireEvent.click(keepBtn);
    await act(async () => {});

    expect(screen.getByTestId("discovery-export-btn")).toBeInTheDocument();
  });

  it("9. ArrowRight keyboard shortcut triggers keep action", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session
      .mockResolvedValueOnce(MOCK_SESSION_NEXT); // send_discovery_feedback (keep)

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("send_discovery_feedback", {
      session_id: "session-abc",
      track_id: "track-1",
      action: "keep",
    });
  });

  it("10. ArrowLeft keyboard shortcut triggers skip action", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SESSION) // start_discovery_session
      .mockResolvedValueOnce(MOCK_SESSION_NEXT); // send_discovery_feedback (skip)

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("send_discovery_feedback", {
      session_id: "session-abc",
      track_id: "track-1",
      action: "skip",
    });
  });

  it("11. shows audio similarity hint during active session", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_SESSION);

    render(<DiscoveryMode seedTrackId="track-seed-1" />);
    await act(async () => {});

    expect(screen.getByTestId("discovery-feature-hint")).toBeInTheDocument();
    expect(screen.getByTestId("discovery-feature-hint")).toHaveTextContent(
      "Matched by audio similarity"
    );
  });
});
