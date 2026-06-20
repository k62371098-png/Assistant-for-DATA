"use client";
import React, { useEffect, useRef, useState } from "react";
import { Download, Table as TableIcon, RefreshCw, BarChart2, LineChart, PieChart, ScatterChart, LayoutDashboard } from "lucide-react";

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

export function ChartRenderer({ config, data, height = 350 }: ChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const [activeConfig, setActiveConfig] = useState<ChartConfig>(config);
  
  // Update local state when prop changes
  useEffect(() => {
    setActiveConfig(config);
  }, [config]);

  useEffect(() => {
    // Wait for window.echarts to be available
    const checkEcharts = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).echarts) {
        clearInterval(checkEcharts);
        initChart();
      }
    }, 100);

    return () => {
      clearInterval(checkEcharts);
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (chartInstance.current) {
      renderChart();
    }
  }, [activeConfig, data]);

  const initChart = () => {
    if (!chartRef.current) return;
    const echarts = (window as any).echarts;
    chartInstance.current = echarts.init(chartRef.current);
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    
    renderChart();

    return () => window.removeEventListener("resize", handleResize);
  };

  const renderChart = () => {
    if (!chartInstance.current || data.length === 0 || activeConfig.type === "none") return;

    let options: any = {
      backgroundColor: "transparent",
      textStyle: { color: "#B8B8C8", fontFamily: "var(--font-inter), sans-serif" },
      tooltip: {
        backgroundColor: "#1E1B4B",
        borderColor: "#534AB7",
        textStyle: { color: "#fff" },
        trigger: activeConfig.type === "pie" || activeConfig.type === "donut" ? "item" : "axis",
      },
      grid: {
        top: 40,
        right: 20,
        bottom: 30,
        left: 50,
        containLabel: true,
      },
    };

    const xAxisData = data.map((d) => String(d[activeConfig.xField] ?? ""));
    const yAxisData = activeConfig.yField ? data.map((d) => Number(d[activeConfig.yField as string]) || 0) : [];

    switch (activeConfig.type) {
      case "bar":
        options.xAxis = { type: "category", data: xAxisData, splitLine: { show: false } };
        options.yAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.series = [{
          type: "bar",
          data: yAxisData,
          itemStyle: { color: CATEGORICAL_PALETTE[0], borderRadius: [4, 4, 0, 0] }
        }];
        break;

      case "horizontal_bar":
        options.xAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.yAxis = { type: "category", data: xAxisData.reverse(), splitLine: { show: false } };
        options.series = [{
          type: "bar",
          data: yAxisData.reverse(),
          itemStyle: { color: CATEGORICAL_PALETTE[0], borderRadius: [0, 4, 4, 0] }
        }];
        break;

      case "line":
      case "area":
        options.xAxis = { type: "category", data: xAxisData, splitLine: { show: false } };
        options.yAxis = { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } };
        options.series = [{
          type: "line",
          data: yAxisData,
          itemStyle: { color: CATEGORICAL_PALETTE[0] },
          lineStyle: { width: 3 },
          areaStyle: activeConfig.type === "area" ? {
            color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [
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
          return `<b>${row}</b><br/>${activeConfig.xField}: ${params.data[0]}<br/>${activeConfig.yField}: ${params.data[1]}`;
        };
        options.series = [{
          type: "scatter",
          data: data.map(d => [Number(d[activeConfig.xField]), Number(d[activeConfig.yField as string]), d[activeConfig.groupField || activeConfig.xField] || "Row"]),
          itemStyle: { color: CATEGORICAL_PALETTE[0] },
          symbolSize: 8
        }];
        break;

      case "pie":
      case "donut":
        const pieData = data.map(d => ({ name: String(d[activeConfig.xField]), value: Number(d[activeConfig.yField as string]) }));
        options.tooltip.trigger = "item";
        options.series = [{
          type: "pie",
          radius: activeConfig.type === "donut" ? ["40%", "70%"] : "70%",
          data: pieData,
          itemStyle: {
            borderRadius: 4,
            borderColor: "#0F0F1A",
            borderWidth: 2
          },
          label: { color: "#B8B8C8" },
          color: CATEGORICAL_PALETTE
        }];
        break;
        
      // Advanced charts (Histogram, Boxplot, Treemap) logic can be elaborated here.
      // ECharts has built-in treemap, and boxplot.
      default:
        // Fallback
        break;
    }

    chartInstance.current.setOption(options, true);
  };

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
