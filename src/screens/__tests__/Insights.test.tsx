/**
 * Tests for the Insights screen synthetic data notice.
 *
 * Acceptance criteria covered:
 *   Sprint-20 — synthetic notice renders when synthetic_fraction > 0
 *   Sprint-20 — synthetic notice is absent when synthetic_fraction === 0
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import Insights from "../Insights";

// ── Mock chart components to avoid SVG/canvas complexity in jsdom ─────────────

vi.mock("../../charts/DonutChart", () => ({
  DonutChart: () => <div data-testid="donut-chart" />,
}));
vi.mock("../../charts/FlowChart", () => ({
  FlowChart: () => <div data-testid="flow-chart" />,
}));
vi.mock("../../charts/TempoMap", () => ({
  TempoMap: () => <div data-testid="tempo-map" />,
}));
vi.mock("../../charts/KeyChart", () => ({
  KeyChart: () => <div data-testid="key-chart" />,
}));

// ── Mock @tauri-apps/api/core ─────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInsightsResponse(syntheticFraction: number, rapidapiConfigured = false) {
  return {
    playlist_id: "pl_test",
    total_tracks: 4,
    genre_breakdown: [{ genre: "Other", count: 4, color: "#888", subgenres: [] }],
    timeline: [
      {
        position: 0,
        track_id: "t1",
        track_name: "Track 1",
        artist_names: [],
        album_art_url: null,
        energy: 0.5,
        valence: 0.5,
        danceability: 0.5,
        tempo: 120,
        popularity: 50,
        key: "C",
        genre: "Other",
        features_source: syntheticFraction === 1.0 ? "synthetic" : "spotify",
      },
    ],
    key_distribution: { C: 1 },
    synthetic_fraction: syntheticFraction,
    rapidapi_configured: rapidapiConfigured,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Insights synthetic data notice", () => {
  it("shows notice when synthetic_fraction is 1.0 (all synthetic)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_insights") return Promise.resolve(makeInsightsResponse(1.0));
      if (cmd === "fetch_audio_features") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Insights playlistId="pl_test" />);

    await waitFor(() => {
      expect(screen.getByTestId("insights-synthetic-notice")).toBeInTheDocument();
    });

    const notice = screen.getByTestId("insights-synthetic-notice");
    expect(notice.textContent).toMatch(/estimated/i);
    expect(notice.textContent).toMatch(/RapidAPI/i);
  });

  it("shows notice when synthetic_fraction is partial (0 < fraction < 1)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_insights") return Promise.resolve(makeInsightsResponse(0.5));
      if (cmd === "fetch_audio_features") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Insights playlistId="pl_test" />);

    await waitFor(() => {
      expect(screen.getByTestId("insights-synthetic-notice")).toBeInTheDocument();
    });

    const notice = screen.getByTestId("insights-synthetic-notice");
    expect(notice.textContent).toMatch(/estimated/i);
  });

  it("shows catalog-gap message (not Settings prompt) when RapidAPI key is configured and all features are synthetic", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_insights") return Promise.resolve(makeInsightsResponse(1.0, true));
      if (cmd === "fetch_audio_features") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Insights playlistId="pl_test" />);

    await waitFor(() => {
      expect(screen.getByTestId("insights-synthetic-notice")).toBeInTheDocument();
    });

    const notice = screen.getByTestId("insights-synthetic-notice");
    expect(notice.textContent).toMatch(/estimated/i);
    expect(notice.textContent).toMatch(/catalog/i);
    expect(notice.textContent).not.toMatch(/Settings/i);
  });

  it("shows catalog-gap message (not Settings prompt) when RapidAPI key is configured and some features are synthetic", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_insights") return Promise.resolve(makeInsightsResponse(0.5, true));
      if (cmd === "fetch_audio_features") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Insights playlistId="pl_test" />);

    await waitFor(() => {
      expect(screen.getByTestId("insights-synthetic-notice")).toBeInTheDocument();
    });

    const notice = screen.getByTestId("insights-synthetic-notice");
    expect(notice.textContent).toMatch(/estimated/i);
    expect(notice.textContent).toMatch(/catalog/i);
    expect(notice.textContent).not.toMatch(/Settings/i);
  });

  it("does NOT show notice when synthetic_fraction is 0", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_insights") return Promise.resolve(makeInsightsResponse(0));
      if (cmd === "fetch_audio_features") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Insights playlistId="pl_test" />);

    // Wait for loading to complete (look for a chart or tracks section)
    await waitFor(() => {
      expect(screen.queryByRole("main")).toBeInTheDocument();
    });

    // Give React a tick to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByTestId("insights-synthetic-notice")).not.toBeInTheDocument();
  });
});
