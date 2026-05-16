import { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlowDataPoint {
  position: number;
  energy: number;
  valence: number;
  danceability: number;
}

type MetricKey = "energy" | "valence" | "danceability";

// ── Color config ──────────────────────────────────────────────────────────────

const METRIC_COLORS: Record<MetricKey, string> = {
  energy: "#FF914D",
  valence: "#FFD93D",
  danceability: "#FF6FAE",
};

const METRIC_LABELS: Record<MetricKey, string> = {
  energy: "Energy",
  valence: "Valence",
  danceability: "Danceability",
};

const METRIC_KEYS: MetricKey[] = ["energy", "valence", "danceability"];

// ── FlowChart ─────────────────────────────────────────────────────────────────
//
// Renders three overlapping area+line series on a shared 0–1 Y axis.
// Each metric is drawn independently (NOT stacked) so their absolute levels
// are directly comparable — e.g. Energy=0.56, Valence=0.97 plot as distinct
// bands rather than collapsing into a single cumulative stack.

interface FlowChartProps {
  data: FlowDataPoint[];
  width?: number;
  height?: number;
}

export function FlowChart({ data, width = 480, height = 200 }: FlowChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const margin = { top: 16, right: 16, bottom: 28, left: 32 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const draw = useCallback(() => {
    if (!svgRef.current || !data.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales — each metric is independently on 0–1
    const xScale = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([0, innerW]);

    const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    // Gridlines (subtle)
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickSize(-innerW)
          .tickFormat(() => "")
      )
      .call((axis) => {
        axis.select(".domain").remove();
        axis
          .selectAll(".tick line")
          .attr("stroke", "rgba(255,255,255,0.06)");
      });

    // Draw each metric as a filled area + stroke line (overlapping, NOT stacked)
    METRIC_KEYS.forEach((key) => {
      const color = METRIC_COLORS[key];

      // Filled area (semi-transparent so overlaps are readable)
      const area = d3
        .area<FlowDataPoint>()
        .x((_d, i) => xScale(i))
        .y0(innerH)
        .y1((d) => yScale(d[key]))
        .curve(d3.curveCatmullRom.alpha(0.5));

      g.append("path")
        .datum(data)
        .attr("data-testid", `flow-area-${key}`)
        .attr("d", area)
        .attr("fill", color)
        .attr("opacity", 0.18);

      // Stroke line on top — easier to read the exact level
      const line = d3
        .line<FlowDataPoint>()
        .x((_d, i) => xScale(i))
        .y((d) => yScale(d[key]))
        .curve(d3.curveCatmullRom.alpha(0.5));

      g.append("path")
        .datum(data)
        .attr("data-testid", `flow-line-${key}`)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.85);
    });

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(Math.min(data.length, 8))
          .tickFormat((d) => `#${Number(d) + 1}`)
      )
      .call((axis) => {
        axis.select(".domain").attr("stroke", "rgba(255,255,255,0.15)");
        axis.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.10)");
        axis
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.40)")
          .attr("font-size", 10);
      });

    // Y axis — labels 0%, 50%, 100% for clarity
    g.append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickFormat((d) => `${Math.round(Number(d) * 100)}%`)
      )
      .call((axis) => {
        axis.select(".domain").attr("stroke", "rgba(255,255,255,0.15)");
        axis.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.10)");
        axis
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.40)")
          .attr("font-size", 10);
      });
  }, [data, innerW, innerH, margin.left, margin.top]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!data.length) {
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
        No audio flow data
      </div>
    );
  }

  return (
    <div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        data-testid="flow-chart"
        style={{ display: "block", overflow: "visible" }}
      />

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {METRIC_KEYS.map((key) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 20,
                height: 2,
                borderRadius: 1,
                background: METRIC_COLORS[key],
                opacity: 0.9,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
              {METRIC_LABELS[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FlowChart;
