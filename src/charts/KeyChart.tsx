import { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";

export interface KeyDistribution {
  [key: string]: number;
}

interface KeyChartProps {
  data: KeyDistribution;
  width?: number;
  height?: number;
}

// Chromatic order for display — naturals first, then sharps, minor after major
const KEY_ORDER = [
  "C", "Cm", "C♯", "C♯m",
  "D", "Dm", "D♯", "D♯m",
  "E", "Em",
  "F", "Fm", "F♯", "F♯m",
  "G", "Gm", "G♯", "G♯m",
  "A", "Am", "A♯", "A♯m",
  "B", "Bm",
];

export function KeyChart({ data, width = 480, height = 180 }: KeyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const margin = { top: 12, right: 16, bottom: 8, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Only include keys that appear in the data, in chromatic order
  const presentKeys = KEY_ORDER.filter((k) => k in data);
  const entries = presentKeys.map((k) => ({ key: k, count: data[k] }));

  const draw = useCallback(() => {
    if (!svgRef.current || !entries.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const yScale = d3
      .scaleBand()
      .domain(entries.map((d) => d.key))
      .range([0, innerH])
      .padding(0.25);

    const xMax = d3.max(entries, (d) => d.count) ?? 1;
    const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerW]);

    // Minor keys slightly muted, major keys full color
    const barColor = (key: string) => (key.endsWith("m") ? "#6A0DAD" : "#1DB9FF");

    // Bars
    g.selectAll("rect")
      .data(entries)
      .join("rect")
      .attr("data-testid", (d) => `key-bar-${d.key}`)
      .attr("x", 0)
      .attr("y", (d) => yScale(d.key)!)
      .attr("width", (d) => xScale(d.count))
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => barColor(d.key))
      .attr("opacity", 0.75)
      .attr("rx", 3);

    // Count labels
    g.selectAll("text.count")
      .data(entries)
      .join("text")
      .attr("class", "count")
      .attr("x", (d) => xScale(d.count) + 4)
      .attr("y", (d) => yScale(d.key)! + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("fill", "rgba(255,255,255,0.50)")
      .attr("font-size", 10)
      .text((d) => d.count);

    // Y axis — key names
    g.append("g")
      .call(d3.axisLeft(yScale).tickSize(0))
      .call((axis) => {
        axis.select(".domain").remove();
        axis.selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.55)")
          .attr("font-size", 11)
          .attr("x", -6);
      });
  }, [entries, innerW, innerH, margin.left, margin.top]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!entries.length) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.25)",
          fontSize: 13,
          border: "1px dashed rgba(255,255,255,0.10)",
          borderRadius: 8,
          boxSizing: "border-box",
        }}
      >
        Key data unavailable
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      data-testid="key-chart"
      role="img"
      aria-label="Key distribution chart showing musical keys across the playlist"
      style={{ display: "block", overflow: "visible" }}
    />
  );
}

export default KeyChart;
