/**
 * Tests for the AIPrompt screen.
 *
 * Acceptance criteria covered:
 *   S5 — Screen renders with correct test id
 *   S5 — Coming Soon badge is present
 *   S5 — Textarea is disabled (feature not yet available)
 *   S5 — Submit button is disabled (feature not yet available)
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AIPrompt } from "../AIPrompt";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AIPrompt screen", () => {
  it("renders ai-prompt-screen", () => {
    render(<AIPrompt />);
    expect(screen.getByTestId("ai-prompt-screen")).toBeInTheDocument();
  });

  it("renders Coming Soon badge", () => {
    render(<AIPrompt />);
    const badge = screen.getByTestId("ai-prompt-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Coming Soon");
  });

  it("textarea is disabled", () => {
    render(<AIPrompt />);
    const textarea = screen.getByTestId("ai-prompt-input");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toBeDisabled();
  });

  it("submit button is disabled", () => {
    render(<AIPrompt />);
    const btn = screen.getByTestId("ai-prompt-submit");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });
});
