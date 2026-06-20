"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/store";
import { motion } from "framer-motion";
import { Upload, MessageSquare, Lightbulb, Database, BarChart2, AlertTriangle, CheckCircle2, Sparkles, ArrowRight, Tag, Zap, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { buildDashboardCharts } from "@/lib/data/analyzer";
import { generateRecommendations } from "@/lib/data/intelligence";
import { useMemo, useEffect } from "react";
import { formatNumber, cn } from "@/lib/utils";
import type { QueryResult } from "@/types";
import { useHydrated } from "@/store/useHydrated";
import { useRouter } from "next/navigation";
import { downloadDatasetRows } from "@/lib/supabase/db";
import { useState } from "react";

export default function DashboardPage() {
  const hydrated = useHydrated();
  const { updateDataset, insights, recommendations, setRecommendations, dismissRecommendation } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const dataset = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

  const dashCharts: QueryResult[] = useMemo(() => dataset ? buildDashboardCharts(dataset) : [], [dataset]);
  const datasetInsights = dataset ? (insights[dataset.id] ?? []) : [];
  const datasetRecs = dataset ? (recommendations[dataset.id] ?? []) : [];
  const activeRecs = datasetRecs.filter(r => !r.dismissed);

  // Generate recommendations on mount if missing
  useEffect(() => {
    if (dataset && datasetRecs.length === 0 && dataset.rows.length >= dataset.schema.rowCount) {
      setRecommendations(dataset.id, generateRecommendations(dataset));
    }
  }, [dataset?.id, dataset?.rows.length, dataset?.schema.rowCount]);

  // Cloud Restore: Fetch missing rows from Supabase if Zustand trimmed them
  useEffect(() => {
    if (dataset && dataset.rows.length < dataset.schema.rowCount && !downloading) {
       setDownloading(true);
       downloadDatasetRows(dataset.id).then(fullRows => {
          updateDataset(dataset.id, { rows: fullRows });
          setDownloading(false);
       }).catch(e => {
          console.error("Failed to restore dataset from cloud", e);
          setDownloading(false); // Fails gracefully, will just show preview rows
       });
    }
  }, [dataset?.id, dataset?.rows.length, dataset?.schema.rowCount]);

  if (!dataset) return <EmptyDashboard />;

  if (downloading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h2 className="text-xl font-bold gradient-text">Restoring from Cloud...</h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
            Syncing full dataset rows securely from Supabase Storage.
          </p>
        </div>
      </AppLayout>
    );
  }

  const { schema } = dataset;
  const intel = schema.intelligence;

  const kpis = [
    { label: "Total Rows", value: formatNumber(schema.rowCount), icon: Database, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Columns", value: schema.colCount, icon: BarChart2, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Missing Data", value: `${schema.missingPercent.toFixed(1)}%`, icon: AlertTriangle, color: schema.missingPercent > 10 ? "text-amber-400" : "text-green-400", bg: schema.missingPercent > 10 ? "bg-amber-500/10" : "bg-green-500/10" },
    { label: "Quality Score", value: `${schema.qualityScore}/100`, icon: CheckCircle2, color: schema.qualityScore >= 80 ? "text-green-400" : "text-amber-400", bg: schema.qualityScore >= 80 ? "bg-green-500/10" : "bg-amber-500/10" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Dataset header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold gradient-text">{dataset.name}</h1>
              {intel && intel.tags.map(t => t !== "general" && (
                <span key={t} className="badge-purple capitalize text-[10px] py-0.5"><Tag className="w-3 h-3 mr-1 inline-block" />{t}</span>
              ))}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {intel?.estimatedCategory ?? "General Dataset"} · Uploaded {new Date(dataset.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/chat" className="btn-primary"><MessageSquare className="w-4 h-4" />Chat</Link>
            <Link href="/insights" className="btn-outline"><Lightbulb className="w-4 h-4" />Insights</Link>
          </div>
        </div>

        {/* Actionable Recommendations */}
        {activeRecs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 overflow-x-auto pb-2">
            {activeRecs.slice(0, 3).map((rec, i) => (
              <div key={rec.id} className={cn("flex-shrink-0 w-72 glass rounded-xl p-4 border relative group overflow-hidden transition-all",
                rec.priority === "high" ? "border-amber-500/30" : "border-border/40"
              )}>
                {rec.priority === "high" && <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 blur-xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />}
                
                <button 
                  onClick={() => dismissRecommendation(dataset.id, rec.id)}
                  className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                
                <div className="flex items-start gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    rec.priority === "high" ? "bg-amber-500/15" : "bg-primary/10"
                  )}>
                    <Zap className={cn("w-4 h-4", rec.priority === "high" ? "text-amber-500" : "text-primary")} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{rec.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-3 line-clamp-2">{rec.description}</p>
                    {rec.actionRoute && (
                      <button 
                        onClick={() => router.push(rec.actionRoute!)}
                        className={cn("text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                          rec.priority === "high" ? "bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 dark:text-amber-400" : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                      >
                        {rec.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="kpi-card">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`w-4.5 h-4.5 ${kpi.color}`} style={{ width: 18, height: 18 }} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </motion.div>
          ))}
        </div>

        {/* AI Insights strip */}
        {datasetInsights.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">AI Insights</span>
              <Link href="/insights" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {datasetInsights.slice(0, 4).map((ins, i) => (
                <div key={i} className={`flex-shrink-0 max-w-[220px] glass rounded-xl p-3 insight-${ins.type}`}>
                  <div className="text-xs font-semibold mb-1 truncate">{ins.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{ins.description}</div>
                  {ins.value && <div className="text-sm font-bold text-primary mt-1">{ins.value}</div>}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Charts grid */}
        {dashCharts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart2 className="w-5 h-5 text-primary" />Auto-Generated Charts</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {dashCharts.map((result, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.1 }} className="chart-container">
                  <h3 className="text-sm font-semibold mb-1 truncate">{result.plan.title}</h3>
                  {result.plan.explanation && (
                    <p className="text-xs text-muted-foreground mb-4">{result.plan.explanation}</p>
                  )}
                  <ChartRenderer result={result} height={260} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Column analysis */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Column Analysis</h2>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full data-table">
              <thead><tr>
                {["Column","Type","Missing%","Unique","Min","Max","Mean"].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {schema.columns.map((col) => (
                  <tr key={col.name}>
                    <td className="font-mono font-medium">{col.name}</td>
                    <td><span className={`stat-badge ${col.type === "number" ? "badge-purple" : col.type === "date" ? "badge-info" : "badge-success"}`}>{col.type}</span></td>
                    <td className={col.nullPercent > 10 ? "text-amber-400 font-semibold" : ""}>{col.nullPercent.toFixed(1)}%</td>
                    <td>{col.uniqueCount.toLocaleString()}</td>
                    <td className="font-mono text-right">{typeof col.min === "number" ? col.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) : col.min ?? "—"}</td>
                    <td className="font-mono text-right">{typeof col.max === "number" ? col.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) : col.max ?? "—"}</td>
                    <td className="font-mono text-right">{typeof col.mean === "number" ? col.mean.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}

function EmptyDashboard() {
  return (
    <AppLayout title="Dashboard">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md">
          <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6 float-animation" style={{ animation: "float 3s ease-in-out infinite" }}>
            <BarChart2 className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold gradient-text mb-3">No Dataset Loaded</h2>
          <p className="text-muted-foreground mb-8">Upload a CSV, Excel, or JSON file to start analyzing your data with AI-powered insights.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/upload" className="btn-primary"><Upload className="w-4 h-4" />Upload Dataset</Link>
            <Link href="/chat" className="btn-outline"><MessageSquare className="w-4 h-4" />Try Chat Mode</Link>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            {[["CSV", "Any CSV file"], ["Excel", ".xlsx / .xls"], ["JSON", "Array of objects"]].map(([fmt, desc]) => (
              <div key={fmt} className="glass rounded-xl p-3">
                <div className="font-semibold text-foreground">{fmt}</div>
                <div>{desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
