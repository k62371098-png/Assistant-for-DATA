"use client";
import { useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Download } from "lucide-react";
import { truncate } from "@/lib/utils";

interface DataPoint {
  label: string;
  value: number;
}

interface Visualization {
  type: "bar" | "line" | "pie" | "horizontal_bar" | "none";
  title: string;
  xAxis: string;
  yAxis: string;
  xLabel?: string;
  yLabel?: string;
  data: DataPoint[];
  color?: string;
  limit?: number;
}

interface AIChartRendererProps {
  visualization: Visualization;
  rowCount: number;
}

const COLORS = ["#7F77DD", "#EC4899", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

export function AIChartRenderer({ visualization, rowCount }: AIChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { type, title, xAxis, yAxis, data, color = "#7F77DD", limit = 10 } = visualization;

  if (type === "none" || !data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-[#0F0F1A] rounded-2xl border border-[#2A2A4A]/50 p-6 text-center">
        <span className="text-sm text-muted-foreground">No chart data found matching your query.</span>
      </div>
    );
  }

  // Slice data based on limit
  const chartData = data.slice(0, limit);

  // Compute heights for horizontal charts to prevent squishing
  const isHorizontal = type === "horizontal_bar";
  const computedHeight = isHorizontal ? Math.max(260, (chartData.length * 36) + 70) : 260;

  const handleExportPNG = () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector("svg");
    if (!svgElement) return;

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const DOMURL = window.URL || window.webkitURL || window;
      const img = new Image();
      const svgUrl = DOMURL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2; // Higher quality export
        canvas.width = svgElement.clientWidth * scale;
        canvas.height = svgElement.clientHeight * scale;
        
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(scale, scale);
          // Set dark theme background
          ctx.fillStyle = "#0F0F1A";
          ctx.fillRect(0, 0, svgElement.clientWidth, svgElement.clientHeight);
          
          // Draw image
          ctx.drawImage(img, 0, 0);
          
          // Download link
          const png = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = png;
          downloadLink.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        DOMURL.revokeObjectURL(svgUrl);
      };
      img.src = svgUrl;
    } catch (err) {
      console.error("Failed to export PNG", err);
    }
  };

  const axisStyle = { fontSize: 10, fill: "hsl(215 20% 55%)" };
  const gridColor = "rgba(255, 255, 255, 0.05)";

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const dataPoint = payload[0].payload;
    return (
      <div className="bg-[#1E1B4B] border border-[#534AB7] rounded-xl p-3 shadow-xl text-sm">
        <div className="font-semibold text-[#AFA9EC] mb-1">{truncate(dataPoint.label, 30)}</div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-muted-foreground">{yAxis}:</span>
          <span className="font-bold text-white">
            {typeof dataPoint.value === "number" ? dataPoint.value.toLocaleString() : dataPoint.value}
          </span>
        </div>
      </div>
    );
  };

  const getBarColor = (index: number) => {
    if (type === "pie") {
      return COLORS[index % COLORS.length];
    }
    // For ranking questions, highlight top bar (brighter purple), rest muted
    if (index === 0) return "#534AB7"; // Brighter purple
    return "#AFA9EC"; // Muted purple
  };

  return (
    <div ref={containerRef} className="w-full bg-[#0F0F1A] border border-[#2A2A4A]/50 rounded-2xl p-5 relative group">
      {/* Header with Title and Export Button */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-[#AFA9EC] max-w-[80%] pr-4 leading-tight">
          {title}
        </h4>
        <button
          onClick={handleExportPNG}
          className="p-2 bg-secondary/40 hover:bg-secondary rounded-lg border border-border/40 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all duration-200"
          title="Export PNG"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chart Canvas */}
      <div className="w-full relative" style={{ height: computedHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {isHorizontal ? (
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={false} />
              <XAxis type="number" tick={axisStyle} stroke="rgba(255,255,255,0.05)" />
              <YAxis
                dataKey="label"
                type="category"
                tick={axisStyle}
                width={80}
                tickFormatter={(v) => truncate(String(v), 12)}
                stroke="rgba(255,255,255,0.05)"
              />
              <Tooltip content={renderTooltip} cursor={{ fill: "rgba(255, 255, 255, 0.02)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={getBarColor(i)} />
                ))}
              </Bar>
            </BarChart>
          ) : type === "line" ? (
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={axisStyle} tickFormatter={(v) => truncate(String(v), 10)} stroke="rgba(255,255,255,0.05)" />
              <YAxis tick={axisStyle} stroke="rgba(255,255,255,0.05)" />
              <Tooltip content={renderTooltip} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                dot={{ fill: color, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          ) : type === "pie" ? (
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius="75%"
                innerRadius="40%"
                paddingAngle={2}
                label={({ name, percent }) => `${truncate(String(name), 10)} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={getBarColor(i)} />
                ))}
              </Pie>
              <Tooltip content={renderTooltip} />
            </PieChart>
          ) : (
            // Default: Vertical Bar Chart
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={false} />
              <XAxis dataKey="label" tick={axisStyle} tickFormatter={(v) => truncate(String(v), 10)} stroke="rgba(255,255,255,0.05)" />
              <YAxis tick={axisStyle} stroke="rgba(255,255,255,0.05)" />
              <Tooltip content={renderTooltip} cursor={{ fill: "rgba(255, 255, 255, 0.02)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={24}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={getBarColor(i)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Row Count Label */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#2A2A4A]/30">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          Based on {rowCount.toLocaleString()} rows
        </span>
      </div>
    </div>
  );
}
