/**
 * Tests for the KeyChart component.
 *
 * Acceptance criteria: AC-S14-03 — KeyChart renders a bar for each key
 * present in the distribution and shows empty-state when no keys.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import KeyChart, { type KeyDistribution } from "../KeyChart";

const MOCK_DATA: KeyDistribution = {
  C: 5,
  Cm: 2,
  "F♯": 3,
  Am: 4,
};

describe("KeyChart", () => {
  it("renders the SVG with correct role and aria-label", () => {
    render(<KeyChart data={MOCK_DATA} />);
    const svg = screen.getByRole("img", { name: /key distribution/i });
    expect(svg).toBeInTheDocument();
  });

  it("renders a bar rect for each key in the data", () => {
    const { container } = render(<KeyChart data={MOCK_DATA} />);
    // Keys present in MOCK_DATA that also appear in KEY_ORDER
    const cBar = container.querySelector("[data-testid='key-bar-C']");
    const cmBar = container.querySelector("[data-testid='key-bar-Cm']");
    const amBar = container.querySelector("[data-testid='key-bar-Am']");
    expect(cBar).not.toBeNull();
    expect(cmBar).not.toBeNull();
    expect(amBar).not.toBeNull();
  });

  it("bars have positive width", () => {
    const { container } = render(<KeyChart data={MOCK_DATA} />);
    const bars = container.querySelectorAll("[data-testid^='key-bar-']");
    bars.forEach((bar) => {
      const w = parseFloat(bar.getAttribute("width") ?? "0");
      expect(w).toBeGreaterThan(0);
    });
  });

  it("shows empty-state when data is empty object", () => {
    render(<KeyChart data={{}} />);
    expect(screen.getByText(/key data unavailable/i)).toBeInTheDocument();
    expect(screen.queryByTestId("key-chart")).not.toBeInTheDocument();
  });

  it("renders without crashing for single key", () => {
    expect(() => render(<KeyChart data={{ C: 1 }} />)).not.toThrow();
  });

  it("renders correct number of bars", () => {
    const { container } = render(<KeyChart data={MOCK_DATA} />);
    const bars = container.querySelectorAll("[data-testid^='key-bar-']");
    // MOCK_DATA has 4 keys, all in KEY_ORDER
    expect(bars.length).toBe(4);
  });
});
