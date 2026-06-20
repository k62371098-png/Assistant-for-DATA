"use client";
import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ZAxis,
} from "recharts";
import { cn, getColorByIndex, truncate } from "@/lib/utils";
import type { QueryResult } from "@/types";

const COLORS = [
  "#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6",
  "#8b5cf6","#ef4444","#14b8a6","#f97316","#84cc16",
];

interface Props { result: QueryResult; height?: number; className?: string; }

function SafeLabel({ value }: { value: unknown }) {
  return <span>{truncate(String(value ?? ""), 14)}</span>;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: unknown; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl p-3 shadow-xl border border-border/60 text-sm">
      {label && <div className="font-semibold text-foreground mb-1.5">{truncate(String(label), 30)}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {typeof p.value === "number" ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function ChartRenderer({ result, height = 300, className }: Props) {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  const { data, plan } = result;

  if (!hasMounted) {
    return <div style={{ height }} className="flex items-center justify-center bg-secondary/10 animate-pulse rounded-xl" />;
  }

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No data available for this chart.
      </div>
    );
  }

  const chartType = plan.chart?.type ?? "bar";

  // 1. Coerce numeric values FIRST so we can find numeric keys reliably
  const dataKeys = data.length ? Object.keys(data[0]) : [];
  const coerced = data.map((row) => {
    const newRow = { ...row };
    dataKeys.forEach((k) => {
      const val = newRow[k];
      if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val.replace(/,/g, "")))) {
        newRow[k] = Number(val.replace(/,/g, ""));
      }
    });
    return newRow;
  });

  // 2. Robust key finding (Case-insensitive)
  const findKey = (target?: string) => {
    if (!target) return null;
    return dataKeys.find(k => k.toLowerCase() === target.toLowerCase()) || null;
  };

  const xKey = findKey(plan.chart?.x) || dataKeys[0];
  const rawY = findKey(plan.chart?.y as string) || dataKeys.find((k) => k !== xKey && typeof coerced[0][k] === "number") || dataKeys[1] || dataKeys[0];
  const yKey = Array.isArray(rawY) ? rawY[0] : rawY;

  console.log("[ChartRenderer]", { chartType, xKey, yKey, sample: coerced[0] });

  const axisStyle = { fontSize: 11, fill: "hsl(215 20% 55%)" };
  const gridColor = "hsl(217 32% 20% / 0.5)";

  if (chartType === "table") {
    const cols = Object.keys(coerced[0]);
    return (
      <div className="overflow-auto max-h-80 rounded-xl border border-border/50">
        <table className="w-full data-table">
          <thead className="sticky top-0 z-10">
            <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {coerced.slice(0, 100).map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={cn(typeof row[c] === "number" ? "font-mono text-right" : "")}>
                    {typeof row[c] === "number"
                      ? (row[c] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : truncate(String(row[c] ?? "—"), 40)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    const innerR = chartType === "donut" ? "55%" : "0%";
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={coerced} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius="80%" innerRadius={innerR} paddingAngle={2} label={({ name, percent }) => `${truncate(String(name), 12)} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
            {coerced.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(v) => truncate(String(v), 16)} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey={xKey} tick={axisStyle} tickFormatter={(v) => truncate(String(v), 10)} />
          <YAxis dataKey={yKey} tick={axisStyle} />
          <ZAxis range={[40, 160]} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={coerced} fill={COLORS[0]} fillOpacity={0.8} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={coerced} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey={xKey} tick={axisStyle} tickFormatter={(v) => truncate(String(v), 12)} />
          <YAxis tick={axisStyle} tickFormatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={coerced} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey={xKey} tick={axisStyle} tickFormatter={(v) => truncate(String(v), 12)} />
          <YAxis tick={axisStyle} tickFormatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2.5} fill="url(#areaGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default: Bar
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={coerced} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} tick={axisStyle} tickFormatter={(v) => truncate(String(v), 12)} />
        <YAxis tick={axisStyle} tickFormatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
          {coerced.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
