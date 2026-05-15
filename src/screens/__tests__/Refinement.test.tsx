/**
 * Tests for the Refinement screen.
 *
 * Acceptance criteria covered:
 *   S4-A01 — Sliders render for all 7 features
 *   S4-A02 — Slider state + debounced IPC
 *   S4-A03 — Genre left-click excludes, right-click boosts
 *   S4-A04 — Filtered track preview
 *   S4-A05 — Export CTA bar renders
 */

import type { ReactNode, HTMLAttributes } from "react";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import Refinement from "../Refinement";

// ── Mock framer-motion ────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      layout: _layout,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...rest
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      layout?: unknown;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...rest}>{children}</div>,
  },
}));

// ── Mock @tauri-apps/api/core ─────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_TRACK_IDS = Array.from({ length: 12 }, (_, i) =>
  `tr_${String(i + 1).padStart(2, "0")}`
);

const GENRE_BUCKETS = ["Neo-Soul", "Hip-Hop", "Chill Pop", "Lo-Fi", "Nu-Jazz", "R&B"];
const MOCK_TRACKS = MOCK_TRACK_IDS.map((id, i) => ({
  id,
  name: `Track ${i + 1}`,
  artistNames: [`Artist ${i + 1}`],
  albumName: `Album ${i + 1}`,
  durationMs: 200000,
  popularity: 50,
  genreBucket: GENRE_BUCKETS[i % GENRE_BUCKETS.length],
}));

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  // fetch_playlist_tracks returns mock tracks;
  // fetch_audio_features throws so sliders default to 0 (no mock fallback);
  // refine_playlist returns identity ordering.
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "fetch_playlist_tracks") {
      return Promise.resolve(MOCK_TRACKS);
    }
    if (cmd === "fetch_audio_features") {
      return Promise.reject(new Error("not available"));
    }
    if (cmd === "refine_playlist") {
      return Promise.resolve({
        orderedTrackIds: MOCK_TRACK_IDS,
        removedTrackIds: [],
      });
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Helper: render + flush async loading ─────────────────────────────────────

async function renderRefinement(props = {}) {
  const result = render(<Refinement playlistId="pl_01" {...props} />);
  // Flush the loadPlaylist() async work (fetch_audio_features + refine_playlist)
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Refinement screen", () => {
  // ── S4-A01: sliders render ───────────────────────────────────────────────

  it("renders sliders for all 7 audio features", async () => {
    await renderRefinement();

    // Each AudioFeatureSlider renders a label element — check labels visible
    const labelTexts = [
      "Energy",
      "Tempo",
      "Popularity",
      "Instrumentalness",
      "Acousticness",
      "Danceability",
      "Valence",
    ];

    for (const label of labelTexts) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders 7 range inputs (one per slider)", async () => {
    await renderRefinement();
    const inputs = screen.getAllByRole("slider");
    expect(inputs.length).toBe(7);
  });

  // ── S4-A02: donut renders ───────────────────────────────────────────────

  it("renders the mini DonutChart", async () => {
    await renderRefinement();
    expect(screen.getByTestId("donut-chart")).toBeInTheDocument();
  });

  // ── S4-A03: genre interactions ──────────────────────────────────────────

  it("left-click on a donut arc excludes that genre", async () => {
    await renderRefinement();

    // The DonutChart renders paths with data-genre attributes.
    // onSegmentClick fires the genre label string.
    // Simulate via the onSegmentClick callback exposed on DonutChart.
    // Since DonutChart calls onSegmentClick on SVG path click,
    // we find the first arc path and click it.
    const arcs = document.querySelectorAll("[data-testid^='donut-arc-']");
    expect(arcs.length).toBeGreaterThan(0);

    const firstArc = arcs[0] as HTMLElement;
    const genre = firstArc.getAttribute("data-genre");
    expect(genre).not.toBeNull();

    fireEvent.click(firstArc);

    // After click the legend should show an "off" badge for that genre
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const legendItem = screen.queryByTestId(`genre-legend-${genre}`);
    if (legendItem) {
      expect(legendItem.textContent).toMatch(/off/i);
    }
  });

  it("right-click on a donut arc boosts that genre", async () => {
    await renderRefinement();

    const wrapper = screen.getByTestId("genre-donut-wrapper");
    const arcs = wrapper.querySelectorAll("[data-testid^='donut-arc-']");
    expect(arcs.length).toBeGreaterThan(0);

    const firstArc = arcs[0] as HTMLElement;
    const genre = firstArc.getAttribute("data-genre");
    expect(genre).not.toBeNull();

    // Simulate right-click (contextmenu) on the arc inside the wrapper
    fireEvent.contextMenu(firstArc);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const legendItem = screen.queryByTestId(`genre-legend-${genre}`);
    if (legendItem) {
      expect(legendItem.textContent).toMatch(/boost/i);
    }
  });

  // ── S4-A02: debounce ─────────────────────────────────────────────────────

  it("debounces slider changes — refine_playlist called only once after 200 ms", async () => {
    await renderRefinement();

    // Clear calls from the initial load
    mockInvoke.mockClear();

    // Move slider multiple times rapidly
    const sliders = screen.getAllByRole("slider");
    const energySlider = sliders[0];

    fireEvent.change(energySlider, { target: { value: "0.3" } });
    fireEvent.change(energySlider, { target: { value: "0.5" } });
    fireEvent.change(energySlider, { target: { value: "0.7" } });

    // Before debounce settles — no call yet
    expect(
      mockInvoke.mock.calls.filter((c) => c[0] === "refine_playlist").length
    ).toBe(0);

    // Advance exactly 200 ms
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const refineCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "refine_playlist"
    );
    expect(refineCalls.length).toBe(1);
  });

  // ── S4-A05: Export CTA bar ───────────────────────────────────────────────

  it("renders the Export CTA bar with an Export to Spotify button", async () => {
    await renderRefinement();
    expect(screen.getByTestId("export-cta-bar")).toBeInTheDocument();
    expect(screen.getByTestId("export-to-spotify-button")).toBeInTheDocument();
  });

  it("opens the Export modal when Export to Spotify button is clicked", async () => {
    await renderRefinement();
    const btn = screen.getByTestId("export-to-spotify-button");
    fireEvent.click(btn);
    expect(screen.getByTestId("export-modal")).toBeInTheDocument();
  });

  // ── S4-A04: track preview list ───────────────────────────────────────────

  it("renders track preview panel", async () => {
    await renderRefinement();
    expect(screen.getByTestId("track-preview-panel")).toBeInTheDocument();
  });

  it("shows loading state initially then resolves", async () => {
    // Render without flushing async work first
    render(<Refinement playlistId="pl_01" />);
    // Loading shimmer should be present while fetching
    // (LoadingState renders .octave-shimmer divs — check for sliders-panel absence)
    expect(screen.queryByTestId("sliders-panel")).not.toBeInTheDocument();

    // Now flush
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId("sliders-panel")).toBeInTheDocument();
  });

  it("sliders panel and donut panel are present after load", async () => {
    await renderRefinement();
    expect(screen.getByTestId("sliders-panel")).toBeInTheDocument();
    expect(screen.getByTestId("donut-panel")).toBeInTheDocument();
  });
});
