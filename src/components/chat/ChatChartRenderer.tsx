"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Download, Table as TableIcon, RefreshCw, BarChart2, LineChart, PieChart, ScatterChart, LayoutDashboard } from "lucide-react";
import * as echarts from "echarts";

export interface ChartConfig {
  type: "bar" | "horizontal_bar" | "line" | "area" | "scatter" | "pie" | "donut" | "treemap" | "histogram" | "box" | "none";
  xField: string;
  yField?: string;
  groupField?: string | null;
  title: string;
  colorScheme: "single" | "categorical";
}

export interface ChartRendererProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  height?: number;
}

const CATEGORICAL_PALETTE = ["#7F77DD", "#5DCAA5", "#F0997B", "#ED93B1", "#85B7EB", "#FAC775"];

/**
 * Normalizes chart data: ensures that each data row has keys matching xField and yField.
 * Handles AI responses that return {label, value} format by remapping them.
 */
function normalizeChartData(
  data: Record<string, unknown>[],
  xField: string,
  yField?: string
): Record<string, unknown>[] {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];

  // If data already has the expected fields, return as-is
  if (xField in firstRow) return data;

  // If data uses {label, value} format (common AI response format), remap
  if ("label" in firstRow && "value" in firstRow) {
    return data.map((row) => ({
      [xField]: row.label,
      ...(yField ? { [yField]: row.value } : {}),
    }));
  }

  // If data uses {name, value} format, remap
  if ("name" in firstRow && "value" in firstRow) {
    return data.map((row) => ({
      [xField]: row.name,
      ...(yField ? { [yField]: row.value } : {}),
    }));
  }

  // Last resort: return data as-is and let ECharts handle missing fields
  return data;
}

export function ChartRenderer({ config, data, height = 350 }: ChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const [activeConfig, setActiveConfig] = useState<ChartConfig>(config);
  
  // Keep refs for latest values to avoid stale closures
  const activeConfigRef = useRef<ChartConfig>(config);
  const dataRef = useRef(data);

  // Update local state and refs when props change
  useEffect(() => {
    setActiveConfig(config);
    activeConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    activeConfigRef.current = activeConfig;
  }, [activeConfig]);

  // Initialize chart instance
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Dispose previous instance if any
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }
    
    chartInstance.current = echarts.init(chartRef.current);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);

    // Also observe the container for size changes (needed when parent container animates in)
    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  // Render chart whenever instance, config, or data changes
  const renderChart = useCallback(() => {
    if (!chartInstance.current) return;
    
    const currentConfig = activeConfigRef.current;
    const rawData = dataRef.current;
    
    if (rawData.length === 0 || currentConfig.type === "none") return;

    // Normalize data to ensure correct field mapping
    const currentData = normalizeChartData(rawData, currentConfig.xField, currentConfig.yField);

    let options: any = {
      backgroundColor: "transparent",
      textStyle: { color: "#B8B8C8", fontFamily: "var(--font-inter), sans-serif" },
      tooltip: {
        backgroundColor: "#1E1B4B",
        borderColor: "#534AB7",
        textStyle: { color: "#fff" },
        trigger: currentConfig.type === "pie" || currentConfig.type === "donut" ? "item" : "axis",
      },
      grid: {
        top: 40,
        right: 20,
        bottom: 30,
        left: 50,
        containLabel: true,
      },
    };

    const xAxisData = currentData.map((d) => String(d[currentConfig.xField] ?? ""));
    const yAxisData = currentConfig.yField ? currentData.map((d) => Number(d[currentConfig.yField as string]) || 0) : [];

    switch (currentConfig.type) {
      case "bar":
        options.xAxis = { type: "category", data: xAxisData, splitLine: { show: false } };
        options.yAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.series = [{
          type: "bar",
          data: yAxisData.length > 0 ? yAxisData : xAxisData.map(() => 1),
          itemStyle: { color: CATEGORICAL_PALETTE[0], borderRadius: [4, 4, 0, 0] }
        }];
        break;

      case "horizontal_bar":
        options.xAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.yAxis = { type: "category", data: [...xAxisData].reverse(), splitLine: { show: false } };
        options.series = [{
          type: "bar",
          data: yAxisData.length > 0 ? [...yAxisData].reverse() : [...xAxisData].reverse().map(() => 1),
          itemStyle: { color: CATEGORICAL_PALETTE[0], borderRadius: [0, 4, 4, 0] }
        }];
        break;

      case "line":
      case "area":
        options.xAxis = { type: "category", data: xAxisData, splitLine: { show: false } };
        options.yAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.series = [{
          type: "line",
          data: yAxisData.length > 0 ? yAxisData : xAxisData.map(() => 1),
          itemStyle: { color: CATEGORICAL_PALETTE[0] },
          lineStyle: { width: 3 },
          areaStyle: currentConfig.type === "area" ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(127,119,221,0.5)" },
              { offset: 1, color: "rgba(127,119,221,0.0)" }
            ])
          } : undefined,
          smooth: true,
          symbolSize: 6
        }];
        break;

      case "scatter":
        options.xAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, scale: true };
        options.yAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, scale: true };
        options.tooltip.trigger = "item";
        options.tooltip.formatter = (params: any) => {
          const row = params.data[2];
          return `<b>${row}</b><br/>${currentConfig.xField}: ${params.data[0]}<br/>${currentConfig.yField}: ${params.data[1]}`;
        };
        options.series = [{
          type: "scatter",
          data: currentData.map(d => [Number(d[currentConfig.xField]), Number(d[currentConfig.yField as string]), d[currentConfig.groupField || currentConfig.xField] || "Row"]),
          itemStyle: { color: CATEGORICAL_PALETTE[0] },
          symbolSize: 8
        }];
        break;

      case "pie":
      case "donut": {
        // Build pie data - handle the case where xField and yField are the same
        let pieData: { name: string; value: number }[];
        
        if (currentConfig.yField && currentConfig.yField !== currentConfig.xField) {
          // Normal case: distinct x (label) and y (value) fields
          pieData = currentData.map(d => ({
            name: String(d[currentConfig.xField] ?? "Unknown"),
            value: Number(d[currentConfig.yField as string]) || 0
          }));
        } else {
          // xField and yField are the same, or yField is missing
          // Aggregate by counting occurrences of each xField value
          const counts: Record<string, number> = {};
          currentData.forEach(d => {
            const key = String(d[currentConfig.xField] ?? "Unknown");
            counts[key] = (counts[key] || 0) + 1;
          });
          pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));
        }
        
        // Filter out zero-value entries and limit for readability
        pieData = pieData.filter(d => d.value > 0);
        if (pieData.length > 20) {
          pieData.sort((a, b) => b.value - a.value);
          const top = pieData.slice(0, 19);
          const otherValue = pieData.slice(19).reduce((sum, d) => sum + d.value, 0);
          pieData = [...top, { name: "Others", value: otherValue }];
        }
        
        options.tooltip.trigger = "item";
        options.tooltip.formatter = (params: any) => {
          return `<b>${params.name}</b><br/>Value: ${params.value}<br/>Share: ${params.percent}%`;
        };
        options.legend = {
          type: "scroll",
          orient: "vertical",
          right: 10,
          top: 20,
          bottom: 20,
          textStyle: { color: "#B8B8C8", fontSize: 11 },
          pageTextStyle: { color: "#B8B8C8" },
        };
        options.series = [{
          type: "pie",
          radius: currentConfig.type === "donut" ? ["40%", "65%"] : ["0%", "65%"],
          center: ["40%", "50%"],
          data: pieData,
          itemStyle: {
            borderRadius: 4,
            borderColor: "#0F0F1A",
            borderWidth: 2
          },
          label: {
            show: true,
            color: "#B8B8C8",
            formatter: "{b}: {d}%",
            fontSize: 11,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold"
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)"
            }
          },
          animationType: "scale",
          animationEasing: "elasticOut",
          animationDelay: () => Math.random() * 200,
          color: CATEGORICAL_PALETTE
        }];
        break;
      }
        
      // Advanced charts (Histogram, Boxplot, Treemap) logic can be elaborated here.
      // ECharts has built-in treemap, and boxplot.
      default:
        // Fallback
        break;
    }

    chartInstance.current.setOption(options, true);
  }, []);

  // Re-render when config, data changes
  useEffect(() => {
    if (chartInstance.current) {
      renderChart();
    }
  }, [activeConfig, data, renderChart]);

  const handleExportPng = () => {
    if (!chartInstance.current) return;
    const url = chartInstance.current.getDataURL({ type: "png", backgroundColor: "#0F0F1A" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConfig.title || "chart"}.png`;
    a.click();
  };

  const handleExportCsv = () => {
    const header = Object.keys(data[0] || {}).join(",");
    const rows = data.map(row => Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const csv = `${header}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConfig.title || "data"}.csv`;
    a.click();
  };

  if (activeConfig.type === "none") return null;

  return (
    <div className="flex flex-col border border-border/50 rounded-xl bg-card overflow-hidden">
      {/* Interactive Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-[#141423]">
        <div className="flex gap-1">
          {[
            { id: "bar", icon: <BarChart2 className="w-4 h-4" />, label: "Bar" },
            { id: "line", icon: <LineChart className="w-4 h-4" />, label: "Line" },
            { id: "pie", icon: <PieChart className="w-4 h-4" />, label: "Pie" },
            { id: "scatter", icon: <ScatterChart className="w-4 h-4" />, label: "Scatter" },
            { id: "horizontal_bar", icon: <LayoutDashboard className="w-4 h-4" />, label: "H-Bar" }
          ].map(btn => (
            <button
              key={btn.id}
              title={btn.label}
              onClick={() => setActiveConfig({ ...activeConfig, type: btn.id as any })}
              className={`p-1.5 rounded-lg transition-colors ${activeConfig.type === btn.id ? "bg-[#534AB7] text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}
            >
              {btn.icon}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveConfig(config)} title="Reset to suggested view" className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleExportCsv} title="Export CSV" className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
            <TableIcon className="w-4 h-4" />
          </button>
          <button onClick={handleExportPng} title="Export PNG" className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3">
        {activeConfig.title && <h4 className="text-sm font-semibold mb-2 text-white/90">{activeConfig.title}</h4>}
        <div ref={chartRef} style={{ height, width: "100%" }} />
        <div className="mt-2 text-xs text-muted-foreground text-right">Based on {data.length} rows</div>
      </div>
    </div>
  );
}
