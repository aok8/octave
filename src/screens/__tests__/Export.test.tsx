/**
 * Tests for the Export screen.
 *
 * Acceptance criteria covered:
 *   S4-A05 — Modal renders name input pre-filled
 *   S4-A06 — Validation (name > 100 chars, empty track list)
 *   S4-A06 — Toggle new/overwrite modes
 *   S4-A06 — Confirm button calls export_playlist invoke
 */

import type { ReactNode, HTMLAttributes } from "react";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Export } from "../Export";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_PLAYLISTS = [
  { id: "pl_01", name: "Midnight R&B Feels", description: "" },
  { id: "pl_02", name: "Sunday Morning", description: "" },
];

const SAMPLE_TRACK_IDS = ["tr_01", "tr_02", "tr_03"];

function setupMocks() {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "fetch_playlists") return Promise.resolve(MOCK_PLAYLISTS);
    return Promise.resolve(undefined);
  });
}

async function renderExport(props: Partial<React.ComponentProps<typeof Export>> = {}) {
  const result = render(
    <Export
      trackIds={SAMPLE_TRACK_IDS}
      playlistId="pl_01"
      {...props}
    />
  );
  // Flush the fetch_playlists useEffect
  await act(async () => {});
  return result;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  setupMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Export screen", () => {
  // ── Name input pre-filled ────────────────────────────────────────────────

  it("pre-fills playlist name with original name + ' — Refined'", async () => {
    await renderExport({ playlistId: "pl_01" });
    const input = screen.getByTestId("export-name-input") as HTMLInputElement;
    expect(input.value).toBe("Midnight R&B Feels — Refined");
  });

  it("uses fallback name when playlistId is not found", async () => {
    await renderExport({ playlistId: "nonexistent" });
    const input = screen.getByTestId("export-name-input") as HTMLInputElement;
    expect(input.value).toBe("My Playlist — Refined");
  });

  // ── Validation: name > 100 chars ─────────────────────────────────────────

  it("shows validation error for name > 100 chars without calling IPC", async () => {
    await renderExport();
    const input = screen.getByTestId("export-name-input");
    const longName = "A".repeat(101);
    fireEvent.change(input, { target: { value: longName } });

    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId("export-name-error")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  it("shows validation error for empty name without calling IPC", async () => {
    await renderExport();
    const input = screen.getByTestId("export-name-input");
    fireEvent.change(input, { target: { value: "" } });

    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId("export-name-error")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  // ── Validation: empty track list ─────────────────────────────────────────

  it("shows validation error for empty track list without calling IPC", async () => {
    await renderExport({ trackIds: [] });
    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    expect(screen.getByText(/no tracks to export/i)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  // ── Mode toggle ──────────────────────────────────────────────────────────

  it("defaults to 'new' mode", async () => {
    await renderExport();
    expect(screen.getByTestId("export-mode-new")).toBeInTheDocument();
    expect(screen.queryByTestId("export-playlist-select")).not.toBeInTheDocument();
  });

  it("switches to overwrite mode and shows playlist selector", async () => {
    await renderExport();
    fireEvent.click(screen.getByTestId("export-mode-overwrite"));
    expect(screen.getByTestId("export-playlist-select")).toBeInTheDocument();
  });

  it("switching back to new mode hides the playlist selector", async () => {
    await renderExport();
    fireEvent.click(screen.getByTestId("export-mode-overwrite"));
    expect(screen.getByTestId("export-playlist-select")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("export-mode-new"));
    expect(screen.queryByTestId("export-playlist-select")).not.toBeInTheDocument();
  });

  // ── Confirm button calls export_playlist ─────────────────────────────────

  it("calls export_playlist invoke with correct args on confirm (new mode)", async () => {
    await renderExport();

    fireEvent.click(screen.getByTestId("export-confirm-button"));
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", {
      payload: {
        mode: "new",
        playlist_id: undefined,
        name: "Midnight R&B Feels — Refined",
        description: "",
        track_ids: SAMPLE_TRACK_IDS,
      },
    });
  });

  it("calls export_playlist with overwrite mode and selected playlist ID", async () => {
    await renderExport();
    fireEvent.click(screen.getByTestId("export-mode-overwrite"));

    const select = screen.getByTestId("export-playlist-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pl_02" } });

    fireEvent.click(screen.getByTestId("export-confirm-button"));
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", {
      payload: {
        mode: "overwrite",
        playlist_id: "pl_02",
        name: "Midnight R&B Feels — Refined",
        description: "",
        track_ids: SAMPLE_TRACK_IDS,
      },
    });
  });

  // ── Success state ─────────────────────────────────────────────────────────

  it("shows success message after successful export", async () => {
    await renderExport();
    fireEvent.click(screen.getByTestId("export-confirm-button"));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByTestId("export-success")).toBeInTheDocument();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("shows error state when export_playlist throws", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "fetch_playlists") return Promise.resolve(MOCK_PLAYLISTS);
      if (cmd === "export_playlist") return Promise.reject(new Error("Spotify API error"));
      return Promise.resolve(undefined);
    });
    await renderExport();
    fireEvent.click(screen.getByTestId("export-confirm-button"));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByText(/Spotify API error/i)).toBeInTheDocument();
  });

  // ── Description field ─────────────────────────────────────────────────────

  it("renders description textarea", async () => {
    await renderExport();
    expect(screen.getByTestId("export-description-input")).toBeInTheDocument();
  });

  it("includes typed description in the export call", async () => {
    await renderExport();

    const textarea = screen.getByTestId("export-description-input");
    fireEvent.change(textarea, { target: { value: "My refined vibes" } });

    fireEvent.click(screen.getByTestId("export-confirm-button"));
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", expect.objectContaining({
      payload: expect.objectContaining({ description: "My refined vibes" }),
    }));
  });
});
