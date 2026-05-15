import { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";

export interface TempoDataPoint {
  position: number;
  tempo: number | null;
}

interface TempoMapProps {
  data: TempoDataPoint[];
  width?: number;
  height?: number;
}

export function TempoMap({ data, width = 480, height = 160 }: TempoMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const margin = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const validData = data.filter((d) => d.tempo != null) as (TempoDataPoint & { tempo: number })[];

  const draw = useCallback(() => {
    if (!svgRef.current || !validData.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleLinear()
      .domain([0, validData.length - 1])
      .range([0, innerW]);

    const tempoExtent = d3.extent(validData, (d) => d.tempo) as [number, number];
    const yPad = (tempoExtent[1] - tempoExtent[0]) * 0.1 || 10;
    const yScale = d3
      .scaleLinear()
      .domain([tempoExtent[0] - yPad, tempoExtent[1] + yPad])
      .range([innerH, 0]);

    // Area fill under the line
    const area = d3
      .area<TempoDataPoint & { tempo: number }>()
      .x((_, i) => xScale(i))
      .y0(innerH)
      .y1((d) => yScale(d.tempo))
      .curve(d3.curveCatmullRom.alpha(0.5));

    g.append("path")
      .datum(validData)
      .attr("fill", "#4DB6AC")
      .attr("opacity", 0.15)
      .attr("d", area);

    // Line
    const line = d3
      .line<TempoDataPoint & { tempo: number }>()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d.tempo))
      .curve(d3.curveCatmullRom.alpha(0.5));

    g.append("path")
      .datum(validData)
      .attr("data-testid", "tempo-line")
      .attr("fill", "none")
      .attr("stroke", "#4DB6AC")
      .attr("stroke-width", 2)
      .attr("d", line);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(Math.min(validData.length, 8))
          .tickFormat((d) => `#${Number(d) + 1}`)
      )
      .call((axis) => {
        axis.select(".domain").attr("stroke", "rgba(255,255,255,0.15)");
        axis.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.10)");
        axis.selectAll(".tick text").attr("fill", "rgba(255,255,255,0.40)").attr("font-size", 10);
      });

    // Y axis — BPM label
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(4))
      .call((axis) => {
        axis.select(".domain").attr("stroke", "rgba(255,255,255,0.15)");
        axis.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.10)");
        axis.selectAll(".tick text").attr("fill", "rgba(255,255,255,0.40)").attr("font-size", 10);
      });

    g.append("text")
      .attr("x", -innerH / 2)
      .attr("y", -36)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .attr("fill", "rgba(255,255,255,0.30)")
      .attr("font-size", 10)
      .text("BPM");
  }, [validData, innerW, innerH, margin.left, margin.top]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!validData.length) {
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
        Tempo data unavailable
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      data-testid="tempo-map"
      role="img"
      aria-label="Tempo map showing BPM over track order"
      style={{ display: "block", overflow: "visible" }}
    />
  );
}

export default TempoMap;
