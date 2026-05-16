/**
 * Tests for the Settings screen.
 *
 * Acceptance criteria covered:
 *   S5 — Account section renders user info
 *   S5 — Logout calls invoke("logout") and shows success
 *   S5 — Export DB calls invoke("export_db") and shows success
 *   S5 — Import DB button is present
 *   S5 — App info section shows static metadata
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Settings } from "../Settings";

// ── Mock @tauri-apps/api/core ─────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

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

describe("Settings screen", () => {
  // ── Account section ───────────────────────────────────────────────────────

  it("renders account section with user info", async () => {
    mockInvoke.mockResolvedValueOnce({ display_name: "Alain K.", email: "aokouassi@gmail.com" });
    render(<Settings />);
    await act(async () => {});
    const section = screen.getByTestId("settings-account-section");
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent("Alain K.");
    expect(section).toHaveTextContent("aokouassi@gmail.com");
  });

  it("renders logout button", () => {
    render(<Settings />);
    expect(screen.getByTestId("settings-logout-btn")).toBeInTheDocument();
  });

  it("calls logout invoke and shows success", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    render(<Settings />);

    fireEvent.click(screen.getByTestId("settings-logout-btn"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInvoke).toHaveBeenCalledWith("logout");
    expect(screen.getByTestId("settings-logout-success")).toBeInTheDocument();
  });

  // ── Storage section ───────────────────────────────────────────────────────

  it("renders export db button", () => {
    render(<Settings />);
    expect(screen.getByTestId("settings-export-db-btn")).toBeInTheDocument();
  });

  it("calls export_db invoke on click", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    render(<Settings />);

    fireEvent.click(screen.getByTestId("settings-export-db-btn"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInvoke).toHaveBeenCalledWith("export_db", { path: "octave-backup.db" });
    expect(screen.getByTestId("settings-export-success")).toBeInTheDocument();
  });

  it("renders import db button", () => {
    render(<Settings />);
    expect(screen.getByTestId("settings-import-db-btn")).toBeInTheDocument();
  });

  // ── App info section ──────────────────────────────────────────────────────

  it("renders app info section", () => {
    render(<Settings />);
    const section = screen.getByTestId("settings-app-info");
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent("Octave");
    expect(section).toHaveTextContent("0.5.0");
    expect(section).toHaveTextContent("MIT");
  });

  // ── AI provider status section ────────────────────────────────────────────

  it("renders AI provider status section", () => {
    render(<Settings />);
    const section = screen.getByTestId("settings-ai-status");
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute("role", "region");
    expect(section).toHaveAttribute("aria-label", "AI provider status");
  });

  it("renders OpenRouter and Ollama status chips as Offline", () => {
    render(<Settings />);
    const openRouterChip = screen.getByTestId("settings-ai-openrouter-chip");
    const ollamaChip = screen.getByTestId("settings-ai-ollama-chip");
    expect(openRouterChip).toBeInTheDocument();
    expect(openRouterChip).toHaveTextContent("OpenRouter");
    expect(openRouterChip).toHaveTextContent("Offline");
    expect(ollamaChip).toBeInTheDocument();
    expect(ollamaChip).toHaveTextContent("Local (Ollama)");
    expect(ollamaChip).toHaveTextContent("Offline");
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("account section has region role", () => {
    render(<Settings />);
    expect(screen.getByTestId("settings-account-section")).toHaveAttribute("role", "region");
  });

  it("account section has aria-label", () => {
    render(<Settings />);
    expect(screen.getByTestId("settings-account-section")).toHaveAttribute("aria-label", "Spotify Account");
  });
});
