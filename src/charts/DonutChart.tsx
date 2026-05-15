import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DonutDataPoint {
  genre: string;
  count: number;
  color: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  genre: string;
  count: number;
  percentage: number;
}

// ── Genre color palette (requirements §6) ─────────────────────────────────────

export const GENRE_COLORS: Record<string, string> = {
  "R&B": "#6A0DAD",
  "Neo-Soul": "#FF914D",
  "Hip-Hop": "#1DB9FF",
  "Chill Pop": "#FF6FAE",
  "Lo-Fi": "#4DB6AC",
  "Nu-Jazz": "#FFD93D",
  Other: "#555555",
};

// ── DonutChart ────────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: DonutDataPoint[];
  width?: number;
  height?: number;
  onSegmentClick?: (genre: string) => void;
}

export function DonutChart({
  data,
  width = 260,
  height = 260,
  onSegmentClick,
}: DonutChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    genre: "",
    count: 0,
    percentage: 0,
  });

  const radius = Math.min(width, height) / 2;
  const innerRadius = radius * 0.55;
  const outerRadius = radius * 0.88;

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const total = d3.sum(data, (d) => d.count);
    if (total === 0) return;

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const pie = d3
      .pie<DonutDataPoint>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(0.02);

    const arc = d3
      .arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(3);

    const arcHover = d3
      .arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 6)
      .cornerRadius(3);

    const arcs = pie(data);

    g.selectAll("path")
      .data(arcs)
      .enter()
      .append("path")
      .attr("d", (d) => arc(d) ?? "")
      .attr("fill", (d) => d.data.color)
      .attr("opacity", 0.85)
      .attr("data-genre", (d) => d.data.genre)
      .attr("data-testid", (_d, i) => `donut-arc-${i}`)
      .style("cursor", onSegmentClick ? "pointer" : "default")
      .style("transition", "opacity 150ms ease")
      .on("mouseenter", function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", (d) => arcHover(d as d3.PieArcDatum<DonutDataPoint>) ?? "")
          .attr("opacity", 1);

        const pct = total > 0 ? Math.round((d.data.count / total) * 100) : 0;
        const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
        setTooltip({
          visible: true,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 8,
          genre: d.data.genre,
          count: d.data.count,
          percentage: pct,
        });
      })
      .on("mousemove", function (event) {
        const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
        setTooltip((prev) => ({
          ...prev,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 8,
        }));
      })
      .on("mouseleave", function (_event, _d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", (d) => arc(d as d3.PieArcDatum<DonutDataPoint>) ?? "")
          .attr("opacity", 0.85);
        setTooltip((prev) => ({ ...prev, visible: false }));
      })
      .on("click", function (_event, d) {
        onSegmentClick?.(d.data.genre);
      });

    // Center label: total count
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("fill", "#ffffff")
      .attr("font-size", 22)
      .attr("font-weight", 700)
      .text(total);

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .attr("fill", "rgba(255,255,255,0.45)")
      .attr("font-size", 11)
      .text("tracks");
  }, [data, width, height, innerRadius, outerRadius, onSegmentClick]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        data-testid="donut-chart"
        style={{ display: "block" }}
      />

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          data-testid="donut-tooltip"
          style={{
            position: "absolute",
            left: tooltip.x + 8,
            top: tooltip.y,
            background: "rgba(18,18,18,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "6px 10px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#ffffff" }}>
            {tooltip.genre}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            {tooltip.count} tracks · {tooltip.percentage}%
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 16px",
          maxWidth: width,
        }}
      >
        {data.filter((d) => d.count > 0).map((d) => (
          <div key={d.genre} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              {d.genre}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DonutChart;
