import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlowDataPoint {
  position: number;
  energy: number;
  valence: number;
  danceability: number;
}

type StackKey = "energy" | "valence" | "danceability";

// ── Color config ──────────────────────────────────────────────────────────────

const STACK_COLORS: Record<StackKey, string> = {
  energy: "#FF914D",
  valence: "#FFD93D",
  danceability: "#FF6FAE",
};

const STACK_LABELS: Record<StackKey, string> = {
  energy: "Energy",
  valence: "Valence",
  danceability: "Danceability",
};

const STACK_KEYS: StackKey[] = ["energy", "valence", "danceability"];

// ── FlowChart ─────────────────────────────────────────────────────────────────

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

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([0, innerW]);

    const yScale = d3.scaleLinear().domain([0, 3]).range([innerH, 0]); // 3 stacked values each max 1

    // Stack generator
    const stack = d3
      .stack<FlowDataPoint, StackKey>()
      .keys(STACK_KEYS)
      .value((d, key) => d[key])
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const series = stack(data);

    // Area generator
    const area = d3
      .area<d3.SeriesPoint<FlowDataPoint>>()
      .x((d, i) => xScale(i))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Draw stacked areas
    series.forEach((layer) => {
      const key = layer.key as StackKey;
      g.append("path")
        .datum(layer)
        .attr("data-testid", `flow-area-${key}`)
        .attr("d", area)
        .attr("fill", STACK_COLORS[key])
        .attr("opacity", 0.65)
        .on("mouseenter", function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr("opacity", 0.9);
        })
        .on("mouseleave", function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr("opacity", 0.65);
        });
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

    // Y axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3))
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
        {STACK_KEYS.map((key) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: STACK_COLORS[key],
                opacity: 0.8,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
              {STACK_LABELS[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FlowChart;
