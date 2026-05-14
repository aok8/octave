/**
 * Tests for the SeedSong screen.
 *
 * Acceptance criteria covered:
 *   R-11 — "Discover from this track" button appears after a track is selected
 *   R-11 — Button calls onDiscover prop with the selected track id
 */

import type { ReactNode, HTMLAttributes } from "react";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SeedSong } from "../SeedSong";
import type { Track } from "../../types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) => (
      <p {...props}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SEARCH_RESULTS: Track[] = [
  {
    id: "track-1",
    name: "Blue in Green",
    artistNames: ["Miles Davis"],
    albumName: "Kind of Blue",
  },
];

const MOCK_RECOMMENDATIONS: Track[] = [
  {
    id: "rec-1",
    name: "So What",
    artistNames: ["Miles Davis"],
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SeedSong — Discover button (R-11)", () => {
  it("shows Discover button after a track is selected and onDiscover prop is provided", async () => {
    const onDiscover = vi.fn();

    // search_tracks → results; fetch_recommendations → recs
    mockInvoke
      .mockResolvedValueOnce(MOCK_SEARCH_RESULTS) // search_tracks
      .mockResolvedValueOnce(MOCK_RECOMMENDATIONS); // fetch_recommendations

    render(<SeedSong onDiscover={onDiscover} />);

    // Type in search box to trigger debounced search
    const searchInput = screen.getByRole("textbox", { name: /search tracks/i });
    fireEvent.change(searchInput, { target: { value: "Miles" } });

    // Advance debounce timer and flush async search
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});

    // Click the first result to select it
    const trackCard = screen.getByText("Blue in Green");
    await act(async () => {
      fireEvent.click(trackCard);
    });

    // Flush recommendation fetch
    await act(async () => {});

    // Discover button should now be visible
    expect(screen.getByTestId("seed-song-discover-btn")).toBeInTheDocument();
  });

  it("calls onDiscover with the selected track id when Discover button is clicked", async () => {
    const onDiscover = vi.fn();

    mockInvoke
      .mockResolvedValueOnce(MOCK_SEARCH_RESULTS) // search_tracks
      .mockResolvedValueOnce(MOCK_RECOMMENDATIONS); // fetch_recommendations

    render(<SeedSong onDiscover={onDiscover} />);

    const searchInput = screen.getByRole("textbox", { name: /search tracks/i });
    fireEvent.change(searchInput, { target: { value: "Miles" } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});

    const trackCard = screen.getByText("Blue in Green");
    await act(async () => {
      fireEvent.click(trackCard);
    });
    await act(async () => {});

    const discoverBtn = screen.getByTestId("seed-song-discover-btn");
    fireEvent.click(discoverBtn);

    expect(onDiscover).toHaveBeenCalledWith("track-1");
  });

  it("does not show Discover button when onDiscover prop is not provided", async () => {
    mockInvoke
      .mockResolvedValueOnce(MOCK_SEARCH_RESULTS)
      .mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    render(<SeedSong />);

    const searchInput = screen.getByRole("textbox", { name: /search tracks/i });
    fireEvent.change(searchInput, { target: { value: "Miles" } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});

    const trackCard = screen.getByText("Blue in Green");
    await act(async () => {
      fireEvent.click(trackCard);
    });
    await act(async () => {});

    expect(screen.queryByTestId("seed-song-discover-btn")).not.toBeInTheDocument();
  });
});
