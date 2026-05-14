/**
 * Tests for the AIPrompt screen.
 *
 * Acceptance criteria covered:
 *   S9 — Screen renders with correct test id
 *   S9 — Mode A: key input, Save Key, Use Local Model
 *   S9 — Mode B: prompt textarea enabled, submit, loading, track list, export, change key
 *   S9 — On mount calls get_ai_status to restore saved key
 */

import type { ReactNode, HTMLAttributes } from "react";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIPrompt } from "../AIPrompt";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render AIPrompt and flush the mount effect (get_ai_status call) */
async function renderAndFlush() {
  mockInvoke.mockResolvedValueOnce(null); // get_ai_status → no saved key
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<AIPrompt />);
  });
  return result!;
}

/** Render AIPrompt with a pre-saved key (skips Mode A) */
async function renderWithSavedKey(savedKey = "sk-or-test") {
  mockInvoke.mockResolvedValueOnce(savedKey); // get_ai_status → key
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<AIPrompt />);
  });
  return result!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AIPrompt screen", () => {
  // 1. Screen root renders
  it("renders ai-prompt-screen", async () => {
    await renderAndFlush();
    expect(screen.getByTestId("ai-prompt-screen")).toBeInTheDocument();
  });

  // 2. Mode A — key input is shown when no key configured
  it("shows key input when no key is configured (Mode A)", async () => {
    await renderAndFlush();
    expect(screen.getByTestId("ai-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("ai-key-save-btn")).toBeInTheDocument();
  });

  // 3. Save Key calls invoke("set_ai_key") with entered key
  it("Save Key button calls invoke set_ai_key with entered key", async () => {
    await renderAndFlush();
    const input = screen.getByTestId("ai-key-input");
    fireEvent.change(input, { target: { value: "sk-or-abc123" } });

    mockInvoke.mockResolvedValueOnce(undefined); // set_ai_key
    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-key-save-btn"));
    });

    expect(mockInvoke).toHaveBeenCalledWith("set_ai_key", { key: "sk-or-abc123" });
  });

  // 4. Use Local Model calls invoke("set_ai_key", { key: "" })
  it("Use Local Model button calls invoke set_ai_key with empty key", async () => {
    await renderAndFlush();
    mockInvoke.mockResolvedValueOnce(undefined); // set_ai_key

    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-use-local-btn"));
    });

    expect(mockInvoke).toHaveBeenCalledWith("set_ai_key", { key: "" });
  });

  // 5. After saving key, shows prompt textarea (Mode B)
  it("shows prompt textarea after saving a key (Mode B)", async () => {
    await renderAndFlush();
    const input = screen.getByTestId("ai-key-input");
    fireEvent.change(input, { target: { value: "sk-or-test" } });

    mockInvoke.mockResolvedValueOnce(undefined); // set_ai_key
    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-key-save-btn"));
    });

    expect(screen.getByTestId("ai-prompt-input")).toBeInTheDocument();
  });

  // 6. Prompt textarea is enabled in Mode B
  it("prompt textarea is enabled in Mode B", async () => {
    await renderWithSavedKey();
    const textarea = screen.getByTestId("ai-prompt-input");
    expect(textarea).not.toBeDisabled();
  });

  // 7. Submit calls invoke("generate_ai_playlist") with prompt and key
  it("Submit button calls invoke generate_ai_playlist with prompt and key", async () => {
    await renderWithSavedKey("sk-or-test");

    const textarea = screen.getByTestId("ai-prompt-input");
    fireEvent.change(textarea, { target: { value: "Chill lo-fi beats for late night coding" } });

    mockInvoke.mockResolvedValueOnce([]); // generate_ai_playlist
    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-prompt-submit"));
    });

    expect(mockInvoke).toHaveBeenCalledWith("generate_ai_playlist", {
      prompt: "Chill lo-fi beats for late night coding",
      aiKey: "sk-or-test",
    });
  });

  // 8. Shows loading state while generating
  it("shows loading state while generating (ai-generating)", async () => {
    await renderWithSavedKey("sk-or-test");

    const textarea = screen.getByTestId("ai-prompt-input");
    fireEvent.change(textarea, { target: { value: "Upbeat morning playlist" } });

    // Mock that never resolves immediately so we can catch the loading state
    let resolveGenerate!: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(new Promise((res) => { resolveGenerate = res; }));

    act(() => {
      fireEvent.click(screen.getByTestId("ai-prompt-submit"));
    });

    expect(screen.getByTestId("ai-generating")).toBeInTheDocument();

    // Clean up the pending promise
    await act(async () => {
      resolveGenerate([]);
    });
  });

  // 9. Shows generated tracks in ai-track-list
  it("shows generated tracks in ai-track-list after generation", async () => {
    await renderWithSavedKey("sk-or-test");

    const textarea = screen.getByTestId("ai-prompt-input");
    fireEvent.change(textarea, { target: { value: "Jazz for Sunday mornings" } });

    const fakeTracks = [
      { id: "t1", name: "Blue in Green", artist_names: ["Miles Davis"] },
      { id: "t2", name: "So What", artist_names: ["Miles Davis"] },
    ];
    mockInvoke.mockResolvedValueOnce(fakeTracks); // generate_ai_playlist

    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-prompt-submit"));
    });

    const trackList = screen.getByTestId("ai-track-list");
    expect(trackList).toBeInTheDocument();
    expect(trackList).toHaveTextContent("Blue in Green");
    expect(trackList).toHaveTextContent("So What");
  });

  // 10. Shows error state when generation fails
  it("shows error state when generation fails", async () => {
    await renderWithSavedKey("sk-or-test");

    const textarea = screen.getByTestId("ai-prompt-input");
    fireEvent.change(textarea, { target: { value: "Dark ambient drone music" } });

    mockInvoke.mockRejectedValueOnce(new Error("Network error")); // generate_ai_playlist

    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-prompt-submit"));
    });

    // ErrorState should render; check for the error message text
    expect(screen.getByText(/Network error/i)).toBeInTheDocument();
  });

  // 11. "Change key" button resets to Mode A
  it("Change key button resets to Mode A", async () => {
    await renderWithSavedKey("sk-or-test");

    // Confirm we're in Mode B
    expect(screen.getByTestId("ai-prompt-input")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-change-key-btn"));
    });

    // Should be back in Mode A — key input visible, prompt textarea gone
    expect(screen.getByTestId("ai-key-input")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-prompt-input")).not.toBeInTheDocument();
  });

  // 12. On mount calls invoke("get_ai_status") to restore saved key
  it("on mount calls get_ai_status to restore saved key", async () => {
    await renderWithSavedKey("sk-or-saved");

    expect(mockInvoke).toHaveBeenCalledWith("get_ai_status");
    // Should be in Mode B because saved key was returned
    expect(screen.getByTestId("ai-prompt-input")).toBeInTheDocument();
  });
});
