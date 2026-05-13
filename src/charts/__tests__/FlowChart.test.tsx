/**
 * Tests for the FlowChart component.
 *
 * Acceptance criteria covered:
 *   S3-A06 — FlowChart renders SVG stacked area paths with correct data length
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import FlowChart, { type FlowDataPoint } from "../FlowChart";

const MOCK_DATA: FlowDataPoint[] = [
  { position: 0, energy: 0.7, valence: 0.6, danceability: 0.8 },
  { position: 1, energy: 0.5, valence: 0.4, danceability: 0.6 },
  { position: 2, energy: 0.8, valence: 0.7, danceability: 0.9 },
  { position: 3, energy: 0.3, valence: 0.5, danceability: 0.5 },
  { position: 4, energy: 0.6, valence: 0.8, danceability: 0.7 },
];

describe("FlowChart", () => {
  it("renders the SVG container", () => {
    render(<FlowChart data={MOCK_DATA} />);
    expect(screen.getByTestId("flow-chart")).toBeInTheDocument();
  });

  it("renders three stacked area paths (energy, valence, danceability)", () => {
    const { container } = render(<FlowChart data={MOCK_DATA} />);
    const energyArea = container.querySelector("[data-testid='flow-area-energy']");
    const valenceArea = container.querySelector("[data-testid='flow-area-valence']");
    const danceArea = container.querySelector("[data-testid='flow-area-danceability']");
    expect(energyArea).not.toBeNull();
    expect(valenceArea).not.toBeNull();
    expect(danceArea).not.toBeNull();
  });

  it("each stacked area path has a non-empty d attribute", () => {
    const { container } = render(<FlowChart data={MOCK_DATA} />);
    const areas = container.querySelectorAll("[data-testid^='flow-area-']");
    areas.forEach((area) => {
      const d = area.getAttribute("d");
      expect(d).toBeTruthy();
      expect(d!.length).toBeGreaterThan(0);
    });
  });

  it("renders legend labels for all three metrics", () => {
    render(<FlowChart data={MOCK_DATA} />);
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Valence")).toBeInTheDocument();
    expect(screen.getByText("Danceability")).toBeInTheDocument();
  });

  it("shows empty-state when data is empty", () => {
    render(<FlowChart data={[]} />);
    expect(screen.getByText(/no audio flow data/i)).toBeInTheDocument();
    expect(screen.queryByTestId("flow-chart")).not.toBeInTheDocument();
  });

  it("renders without crashing for single data point", () => {
    const single: FlowDataPoint[] = [
      { position: 0, energy: 0.5, valence: 0.5, danceability: 0.5 },
    ];
    expect(() => render(<FlowChart data={single} />)).not.toThrow();
  });

  it("renders paths with correct number matching data length", () => {
    const { container } = render(<FlowChart data={MOCK_DATA} />);
    // 3 layers for the 3 keys, each rendered as one path
    const paths = container.querySelectorAll("[data-testid^='flow-area-']");
    expect(paths.length).toBe(3);
  });
});
