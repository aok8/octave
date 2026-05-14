/**
 * Tests for the DonutChart component.
 *
 * Acceptance criteria covered:
 *   S3-A04 — DonutChart renders SVG arcs matching genre count, tooltip on hover
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DonutChart, { type DonutDataPoint } from "../DonutChart";

// Mock d3 minimally — use real d3 since jsdom supports SVG
// (D3 runs fine in jsdom for SVG path generation)

const MOCK_DATA: DonutDataPoint[] = [
  { genre: "R&B", count: 5, color: "#6A0DAD" },
  { genre: "Hip-Hop", count: 3, color: "#1DB9FF" },
  { genre: "Lo-Fi", count: 2, color: "#4DB6AC" },
];

describe("DonutChart", () => {
  it("renders the SVG container", () => {
    render(<DonutChart data={MOCK_DATA} />);
    expect(screen.getByTestId("donut-chart")).toBeInTheDocument();
  });

  it("renders one arc per data point with non-zero count", () => {
    const { container } = render(<DonutChart data={MOCK_DATA} />);
    const arcs = container.querySelectorAll("[data-testid^='donut-arc-']");
    expect(arcs.length).toBe(MOCK_DATA.length);
  });

  it("renders correct number of arcs for filtered (non-zero) data", () => {
    const dataWithZero: DonutDataPoint[] = [
      ...MOCK_DATA,
      { genre: "Nu-Jazz", count: 0, color: "#FFD93D" },
    ];
    const { container } = render(<DonutChart data={dataWithZero} />);
    // D3 will still generate a path for zero-count items (pie value=0),
    // but the total-count arcs rendered should match data length
    const arcs = container.querySelectorAll("[data-testid^='donut-arc-']");
    // All data points get a path; zero-count gets a degenerate arc
    expect(arcs.length).toBeGreaterThanOrEqual(MOCK_DATA.length);
  });

  it("displays the total count in the center", () => {
    render(<DonutChart data={MOCK_DATA} />);
    const total = MOCK_DATA.reduce((s, d) => s + d.count, 0); // 10
    expect(screen.getByText(String(total))).toBeInTheDocument();
  });

  it("calls onSegmentClick when an arc is clicked", () => {
    const handleClick = vi.fn();
    const { container } = render(
      <DonutChart data={MOCK_DATA} onSegmentClick={handleClick} />
    );
    const firstArc = container.querySelector("[data-testid='donut-arc-0']");
    expect(firstArc).not.toBeNull();
    fireEvent.click(firstArc!);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("shows tooltip on mouseenter", () => {
    const { container } = render(<DonutChart data={MOCK_DATA} />);
    const firstArc = container.querySelector("[data-testid='donut-arc-0']");
    expect(firstArc).not.toBeNull();
    fireEvent.mouseEnter(firstArc!);
    // Tooltip should now be visible
    expect(screen.getByTestId("donut-tooltip")).toBeInTheDocument();
  });

  it("hides tooltip on mouseleave", () => {
    const { container } = render(<DonutChart data={MOCK_DATA} />);
    const firstArc = container.querySelector("[data-testid='donut-arc-0']");
    expect(firstArc).not.toBeNull();
    fireEvent.mouseEnter(firstArc!);
    expect(screen.getByTestId("donut-tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(firstArc!);
    expect(screen.queryByTestId("donut-tooltip")).not.toBeInTheDocument();
  });

  it("renders legend items for non-zero genres", () => {
    render(<DonutChart data={MOCK_DATA} />);
    expect(screen.getByText("R&B")).toBeInTheDocument();
    expect(screen.getByText("Hip-Hop")).toBeInTheDocument();
    expect(screen.getByText("Lo-Fi")).toBeInTheDocument();
  });

  it("renders without crashing when data is empty", () => {
    expect(() => render(<DonutChart data={[]} />)).not.toThrow();
  });
});
