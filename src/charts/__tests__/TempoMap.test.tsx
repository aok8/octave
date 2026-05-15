/**
 * Tests for the TempoMap component.
 *
 * Acceptance criteria: AC-S14-02 — TempoMap renders a line path
 * for each valid tempo data point and shows empty-state when no data.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TempoMap, { type TempoDataPoint } from "../TempoMap";

const MOCK_DATA: TempoDataPoint[] = [
  { position: 0, tempo: 110 },
  { position: 1, tempo: 125 },
  { position: 2, tempo: 98 },
  { position: 3, tempo: 140 },
  { position: 4, tempo: 105 },
];

describe("TempoMap", () => {
  it("renders the SVG with correct role and aria-label", () => {
    render(<TempoMap data={MOCK_DATA} />);
    const svg = screen.getByRole("img", { name: /tempo map/i });
    expect(svg).toBeInTheDocument();
  });

  it("renders the tempo line path", () => {
    const { container } = render(<TempoMap data={MOCK_DATA} />);
    const line = container.querySelector("[data-testid='tempo-line']");
    expect(line).not.toBeNull();
    const d = line!.getAttribute("d");
    expect(d).toBeTruthy();
    expect(d!.length).toBeGreaterThan(0);
  });

  it("shows empty-state when all tempo values are null", () => {
    const nullData: TempoDataPoint[] = [
      { position: 0, tempo: null },
      { position: 1, tempo: null },
    ];
    render(<TempoMap data={nullData} />);
    expect(screen.getByText(/tempo data unavailable/i)).toBeInTheDocument();
    expect(screen.queryByTestId("tempo-map")).not.toBeInTheDocument();
  });

  it("shows empty-state when data array is empty", () => {
    render(<TempoMap data={[]} />);
    expect(screen.getByText(/tempo data unavailable/i)).toBeInTheDocument();
  });

  it("renders without crashing for single data point", () => {
    expect(() =>
      render(<TempoMap data={[{ position: 0, tempo: 120 }]} />)
    ).not.toThrow();
  });

  it("filters out null tempo points and still renders", () => {
    const mixedData: TempoDataPoint[] = [
      { position: 0, tempo: 120 },
      { position: 1, tempo: null },
      { position: 2, tempo: 130 },
    ];
    const { container } = render(<TempoMap data={mixedData} />);
    const line = container.querySelector("[data-testid='tempo-line']");
    expect(line).not.toBeNull();
  });
});
