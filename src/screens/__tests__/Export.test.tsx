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
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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

const SAMPLE_TRACK_IDS = ["tr_01", "tr_02", "tr_03"];

function renderExport(props: Partial<React.ComponentProps<typeof Export>> = {}) {
  return render(
    <Export
      trackIds={SAMPLE_TRACK_IDS}
      playlistId="pl_01"
      {...props}
    />
  );
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockInvoke.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Export screen", () => {
  // ── Name input pre-filled ────────────────────────────────────────────────

  it("pre-fills playlist name with original name + ' — Refined'", () => {
    renderExport({ playlistId: "pl_01" });
    const input = screen.getByTestId("export-name-input") as HTMLInputElement;
    expect(input.value).toBe("Midnight R&B Feels — Refined");
  });

  it("uses fallback name when playlistId is not found", () => {
    renderExport({ playlistId: "nonexistent" });
    const input = screen.getByTestId("export-name-input") as HTMLInputElement;
    expect(input.value).toBe("My Playlist — Refined");
  });

  // ── Validation: name > 100 chars ─────────────────────────────────────────

  it("shows validation error for name > 100 chars without calling IPC", async () => {
    renderExport();
    const input = screen.getByTestId("export-name-input");
    const longName = "A".repeat(101);
    fireEvent.change(input, { target: { value: longName } });

    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId("export-name-error")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  it("shows validation error for empty name without calling IPC", async () => {
    renderExport();
    const input = screen.getByTestId("export-name-input");
    fireEvent.change(input, { target: { value: "" } });

    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId("export-name-error")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  // ── Validation: empty track list ─────────────────────────────────────────

  it("shows validation error for empty track list without calling IPC", () => {
    renderExport({ trackIds: [] });
    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    // Validation is synchronous — the handler returns before any await
    expect(screen.getByText(/no tracks to export/i)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("export_playlist", expect.anything());
  });

  // ── Mode toggle ──────────────────────────────────────────────────────────

  it("defaults to 'new' mode", () => {
    renderExport();
    const newBtn = screen.getByTestId("export-mode-new");
    expect(newBtn).toBeInTheDocument();
    // In new mode, the overwrite selector should NOT be visible
    expect(screen.queryByTestId("export-playlist-select")).not.toBeInTheDocument();
  });

  it("switches to overwrite mode and shows playlist selector", () => {
    renderExport();
    const overwriteBtn = screen.getByTestId("export-mode-overwrite");
    fireEvent.click(overwriteBtn);

    expect(screen.getByTestId("export-playlist-select")).toBeInTheDocument();
  });

  it("switching back to new mode hides the playlist selector", () => {
    renderExport();

    fireEvent.click(screen.getByTestId("export-mode-overwrite"));
    expect(screen.getByTestId("export-playlist-select")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("export-mode-new"));
    expect(screen.queryByTestId("export-playlist-select")).not.toBeInTheDocument();
  });

  // ── Confirm button calls export_playlist ─────────────────────────────────

  it("calls export_playlist invoke with correct args on confirm (new mode)", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    renderExport();

    const confirmBtn = screen.getByTestId("export-confirm-button");
    fireEvent.click(confirmBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", {
      mode: "new",
      playlistId: undefined,
      name: "Midnight R&B Feels — Refined",
      description: "",
      trackIds: SAMPLE_TRACK_IDS,
    });
  });

  it("calls export_playlist with overwrite mode and selected playlist ID", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    renderExport();

    // Switch to overwrite
    fireEvent.click(screen.getByTestId("export-mode-overwrite"));

    // Select a playlist (first in list = pl_01)
    const select = screen.getByTestId("export-playlist-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pl_02" } });

    fireEvent.click(screen.getByTestId("export-confirm-button"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", {
      mode: "overwrite",
      playlistId: "pl_02",
      name: "Midnight R&B Feels — Refined",
      description: "",
      trackIds: SAMPLE_TRACK_IDS,
    });
  });

  // ── Success state ─────────────────────────────────────────────────────────

  it("shows success message after successful export", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    renderExport();

    fireEvent.click(screen.getByTestId("export-confirm-button"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId("export-success")).toBeInTheDocument();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("shows error state when export_playlist throws", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Spotify API error"));
    renderExport();

    fireEvent.click(screen.getByTestId("export-confirm-button"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/Spotify API error/i)).toBeInTheDocument();
  });

  // ── Description field ─────────────────────────────────────────────────────

  it("renders description textarea", () => {
    renderExport();
    expect(screen.getByTestId("export-description-input")).toBeInTheDocument();
  });

  it("includes typed description in the export call", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    renderExport();

    const textarea = screen.getByTestId("export-description-input");
    fireEvent.change(textarea, { target: { value: "My refined vibes" } });

    fireEvent.click(screen.getByTestId("export-confirm-button"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInvoke).toHaveBeenCalledWith("export_playlist", expect.objectContaining({
      description: "My refined vibes",
    }));
  });
});
