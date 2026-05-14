/**
 * WCAG AA accessibility audit for all Octave screens.
 *
 * Acceptance criteria: AC-S5-07 — automated axe-core scan on all screens
 * reports zero WCAG AA violations.
 *
 * Notes:
 *  - color-contrast is disabled: jsdom does not compute CSS custom properties,
 *    so all computed contrast values are 0, producing false positives.
 *    Color contrast is validated manually against the design token palette.
 *  - Tests run sequentially (describe.sequential) because axe-core is a
 *    singleton that cannot run concurrent scans.
 *  - Fake timers are NOT used here: axe.run() uses setTimeout internally,
 *    which would deadlock under fake timers.
 */

import type { ReactNode, HTMLAttributes } from "react";
import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { configureAxe } from "jest-axe";

// ── axe instance ──────────────────────────────────────────────────────────────

const axe = configureAxe({
  rules: { "color-contrast": { enabled: false } },
});

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) => (
      <p {...props}>{children}</p>
    ),
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }) => (
      <span {...props}>{children}</span>
    ),
    button: ({ children, ...props }: HTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Stub D3 charts — SVG rendering is not meaningful in jsdom, but the
// stub must still produce accessible markup.
vi.mock("../../charts/DonutChart", () => ({
  DonutChart: () => <svg role="img" aria-label="Genre breakdown donut chart" />,
}));

vi.mock("../../charts/FlowChart", () => ({
  FlowChart: () => <svg role="img" aria-label="Audio flow chart" />,
}));

const mockInvoke = vi.mocked(invoke);

// Default mock: return empty array. Tests that need structured responses
// override mockInvoke.mockImplementation before calling renderAndAudit.
beforeEach(() => {
  mockInvoke.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Screen imports ────────────────────────────────────────────────────────────

import Home from "../Home";
import { SeedPlaylist } from "../SeedPlaylist";
import { SeedSong } from "../SeedSong";
import { Insights } from "../Insights";
import { Refinement } from "../Refinement";
import { Export } from "../Export";
import { Settings } from "../Settings";
import { AIPrompt } from "../AIPrompt";
import { DiscoveryMode } from "../DiscoveryMode";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderAndAudit(ui: React.ReactElement) {
  const { container } = render(ui);
  await act(async () => {});
  return axe(container);
}

// ── Tests (sequential — axe-core is a singleton) ──────────────────────────────

describe.sequential("WCAG AA accessibility audit", () => {
  it("Home screen has no violations", async () => {
    const results = await renderAndAudit(<Home />);
    expect(results).toHaveNoViolations();
  }, 15000);

  it("SeedPlaylist screen has no violations", async () => {
    const results = await renderAndAudit(<SeedPlaylist />);
    expect(results).toHaveNoViolations();
  }, 10000);

  it("SeedSong screen has no violations", async () => {
    const results = await renderAndAudit(<SeedSong />);
    expect(results).toHaveNoViolations();
  }, 10000);

  it("Insights screen has no violations", async () => {
    const results = await renderAndAudit(
      <Insights playlistId="pl_test" />
    );
    expect(results).toHaveNoViolations();
  }, 10000);

  it("Refinement screen has no violations", async () => {
    // refine_playlist must return the expected shape or Refinement crashes
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "refine_playlist") {
        return Promise.resolve({ orderedTrackIds: [], removedTrackIds: [] });
      }
      return Promise.resolve([]);
    });
    const results = await renderAndAudit(<Refinement />);
    expect(results).toHaveNoViolations();
  }, 10000);

  it("Export screen has no violations", async () => {
    mockInvoke.mockResolvedValue([]);
    const results = await renderAndAudit(
      <Export trackIds={["t1", "t2"]} playlistId="pl_test" />
    );
    expect(results).toHaveNoViolations();
  }, 10000);

  it("Settings screen has no violations", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_user_profile") {
        return Promise.resolve({ display_name: "Test User", email: "test@example.com" });
      }
      if (cmd === "get_ai_status") {
        return Promise.resolve(null);
      }
      return Promise.resolve(undefined);
    });
    const results = await renderAndAudit(<Settings />);
    expect(results).toHaveNoViolations();
  }, 10000);

  it("AIPrompt screen has no violations", async () => {
    mockInvoke.mockResolvedValue(null);
    const results = await renderAndAudit(<AIPrompt />);
    expect(results).toHaveNoViolations();
  }, 10000);

  it("DiscoveryMode screen has no violations (placeholder state)", async () => {
    // No seedTrackId → placeholder / seed-picker state; no IPC call is made
    const results = await renderAndAudit(<DiscoveryMode />);
    expect(results).toHaveNoViolations();
  }, 10000);
});
