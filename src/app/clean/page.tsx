"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/store";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Upload, Rows3, AlertTriangle, Copy, Activity,
  CheckCircle, Info, Download, Sparkles, Settings2, Eye, FileText,
  ChevronDown, Play, Loader2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/store/useHydrated";
import { cn, downloadCSV } from "@/lib/utils";
import { processRows } from "@/lib/data/parser";
import {
  buildColumnRules, computeDatasetStats, getStrategiesForType,
  applyRules, generateDiffRows,
  type ColumnRule, type GlobalSettings, type CleanLogEntry, type DiffCell, type DiffChangeType
} from "@/lib/data/cleanUtils";
import toast from "react-hot-toast";

const TABS = [
  { key: "rules", label: "Column Rules", icon: Rows3 },
  { key: "settings", label: "Global Settings", icon: Settings2 },
  { key: "preview", label: "Preview Changes", icon: Eye },
  { key: "report", label: "Clean Report", icon: FileText },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TYPE_COLORS: Record<string, string> = {
  numeric: "bg-blue-500/15 text-blue-400",
  text: "bg-emerald-500/15 text-emerald-400",
  categorical: "bg-purple-500/15 text-purple-400",
  date: "bg-amber-500/15 text-amber-400",
};

// Animated number component
function AnimatedStat({ value, color }: { value: string; color: string }) {
  return <motion.div key={value} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={cn("text-xl font-bold", color)}>{value}</motion.div>;
}

export default function CleanPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { updateDataset } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const dataset = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;

  const [activeTab, setActiveTab] = useState<TabKey>("rules");
  const [rules, setRules] = useState<ColumnRule[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({
    removeDuplicates: true, trimWhitespace: true, standardizeDates: true,
    flagOutliers: false, addQualityScore: false, preserveOriginals: false,
    missingThreshold: 50,
  });
  const [localThreshold, setLocalThreshold] = useState(50);
  const [cleaning, setCleaning] = useState(false);
  const [log, setLog] = useState<CleanLogEntry[]>([]);
  const [cleanedRows, setCleanedRows] = useState<Record<string, unknown>[] | null>(null);
  const [visibleLogIdx, setVisibleLogIdx] = useState(0);

  // Debounce slider updates to global settings
  useEffect(() => {
    const handler = setTimeout(() => {
      setSettings(s => s.missingThreshold === localThreshold ? s : { ...s, missingThreshold: localThreshold });
    }, 150);
    return () => clearTimeout(handler);
  }, [localThreshold]);

  // Initialize rules when dataset changes
  useEffect(() => {
    if (dataset) {
      setRules(buildColumnRules(dataset, settings));
      setLog([]);
      setCleanedRows(null);
    }
  }, [dataset?.id]);

  // Re-check threshold when slider changes
  useEffect(() => {
    if (dataset) {
      setRules(prev => {
        let changed = false;
        const next = prev.map(r => {
          const col = dataset.schema.columns.find(c => c.name === r.column);
          if (!col) return r;
          const strategies = getStrategiesForType(r.detectedType);
          if (col.nullPercent > settings.missingThreshold && strategies.includes("Drop rows")) {
            if (r.strategy !== "Drop rows" || !r.autoSetByThreshold) {
              changed = true;
              return { ...r, strategy: "Drop rows", autoSetByThreshold: true };
            }
          } else if (r.autoSetByThreshold && col.nullPercent <= settings.missingThreshold) {
            changed = true;
            return { ...r, strategy: strategies[0], autoSetByThreshold: false };
          }
          return r;
        });
        return changed ? next : prev;
      });
    }
  }, [settings.missingThreshold, dataset]);

  const stats = useMemo(() => {
    if (!dataset) return null;
    return computeDatasetStats(dataset);
  }, [dataset, cleanedRows]);

  const updateRule = useCallback((col: string, updates: Partial<ColumnRule>) => {
    setRules(prev => prev.map(r => r.column === col ? { ...r, ...updates, autoSetByThreshold: false } : r));
    setCleanedRows(null);
  }, []);

  // Live preview
  const previewDiff = useMemo(() => {
    if (!dataset || activeTab !== "preview") return null;
    try {
      const { cleanedRows: cleaned } = applyRules(dataset, rules, settings);
      return generateDiffRows(dataset.rows, cleaned, rules, 500);
    } catch { return null; }
  }, [dataset, rules, settings, activeTab]);

  const changedRows = useMemo(() => {
    if (!previewDiff) return [];
    return previewDiff.rows.filter(r => r.hasChange);
  }, [previewDiff]);

  const runCleaning = async () => {
    if (!dataset) return;
    setCleaning(true);
    await new Promise(r => setTimeout(r, 400));
    try {
      const { cleanedRows: cleaned, log: newLog } = applyRules(dataset, rules, settings);
      setCleanedRows(cleaned);
      setLog(newLog);
      setVisibleLogIdx(0);
      setActiveTab("report");

      // Animate log entries with 350ms delay
      for (let i = 0; i <= newLog.length; i++) {
        await new Promise(r => setTimeout(r, 350));
        setVisibleLogIdx(i);
      }

      // Update dataset in global state
      const updatedDs = processRows(cleaned, dataset.name);
      updateDataset(dataset.id, { rows: updatedDs.rows, schema: updatedDs.schema });

      setCleaning(false);
      toast.success("Dataset cleaned successfully!");
    } catch (e) {
      toast.error("Cleaning failed.");
      setCleaning(false);
    }
  };

  if (!dataset) {
    return (
      <AppLayout title="Clean Data">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-9 h-9 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dataset Loaded</h2>
          <p className="text-muted-foreground mb-6">Upload a dataset first to clean it.</p>
          <Link href="/upload" className="btn-primary"><Upload className="w-4 h-4" />Upload Dataset</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Clean Data">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Smart Data Cleaner</h1>
            <p className="text-muted-foreground text-sm mt-1">{dataset.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {cleanedRows && !cleaning && (
              <motion.button initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                onClick={() => downloadCSV(cleanedRows, dataset.name.replace(/\.(csv|xlsx?)$/i, "_cleaned.csv"))}
                className="btn-outline py-3 px-6 bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/30">
                <Download className="w-4 h-4" /> Download Cleaned CSV
              </motion.button>
            )}
            <button onClick={runCleaning} disabled={cleaning} className="btn-primary py-3 px-6">
              {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {cleaning ? "Cleaning…" : "Run Cleaning"}
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Rows", value: stats.totalRows.toLocaleString(), icon: Rows3, color: "text-blue-400" },
              { label: "Missing Values", value: stats.missingValues.toLocaleString(), icon: AlertTriangle, color: stats.missingValues > 0 ? "text-amber-400" : "text-green-400" },
              { label: "Duplicates", value: stats.duplicates.toLocaleString(), icon: Copy, color: stats.duplicates > 0 ? "text-red-400" : "text-green-400" },
              { label: "Outliers", value: stats.outliers.toLocaleString(), icon: Activity, color: stats.outliers > 0 ? "text-purple-400" : "text-green-400" },
            ].map(s => (
              <div key={s.label} className="kpi-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <s.icon className={cn("w-5 h-5", s.color)} />
                </div>
                <div>
                  <AnimatedStat value={s.value} color={s.color} />
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex flex-wrap gap-2 glass rounded-2xl p-1.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn("flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all",
                activeTab === key ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ═══════════ Column Rules Tab ═══════════ */}
        {activeTab === "rules" && (
          <div className="space-y-3">
            {rules.map(rule => (
              <motion.div key={rule.column} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn("glass rounded-2xl p-4 border border-border/40", rule.autoSetByThreshold && "border-l-4 border-l-amber-500")}
                title={rule.autoSetByThreshold ? `Auto-set to Drop rows: exceeds ${settings.missingThreshold}% missing threshold` : undefined}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rule.enabled} onChange={e => updateRule(rule.column, { enabled: e.target.checked })}
                      className="w-4 h-4 rounded accent-[#534AB7]" />
                    <span className="font-semibold text-sm">{rule.column}</span>
                  </label>
                  <span className={cn("stat-badge text-[10px]", TYPE_COLORS[rule.detectedType])}>{rule.detectedType}</span>
                  {rule.autoSetByThreshold && (
                    <span className="stat-badge text-[10px] bg-amber-500/15 text-amber-400">auto: threshold</span>
                  )}
                  {rule.issues.map(iss => (
                    <span key={iss.type} className={cn("stat-badge text-[10px]",
                      iss.type === "missing" ? "bg-amber-500/15 text-amber-400" :
                      iss.type === "outlier" ? "bg-red-500/15 text-red-400" :
                      "bg-slate-500/15 text-slate-400"
                    )}>{iss.label}</span>
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="relative">
                    <select value={rule.strategy} onChange={e => updateRule(rule.column, { strategy: e.target.value })}
                      disabled={!rule.enabled}
                      className="appearance-none bg-secondary/60 border border-border/50 rounded-xl px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-40">
                      {getStrategiesForType(rule.detectedType).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                  {rule.strategy === "Fill → Custom Value" && rule.enabled && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="w-full mt-2">
                      <input type="text" placeholder="Type custom fill value…" value={rule.customValue}
                        onChange={e => updateRule(rule.column, { customValue: e.target.value })}
                        className="w-full bg-secondary/60 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                        style={{ border: "1px solid #534AB7" }} />
                      {rule.customValue ? (
                        <p className="text-muted-foreground mt-1" style={{ fontSize: "12px" }}>
                          Will fill nulls in &quot;{rule.column}&quot; with &quot;{rule.customValue}&quot;
                        </p>
                      ) : (
                        <p className="text-amber-400 mt-1" style={{ fontSize: "12px" }}>
                          ⚠ Enter a value or choose a different strategy
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ═══════════ Global Settings Tab ═══════════ */}
        {activeTab === "settings" && (
          <div className="glass rounded-2xl p-6 space-y-6">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" />Global Cleaning Settings</h3>
            {[
              { key: "removeDuplicates" as const, label: "Remove exact duplicates", desc: "Keep first occurrence, remove all subsequent identical rows" },
              { key: "trimWhitespace" as const, label: "Trim all text whitespace", desc: "Strip leading/trailing spaces from all text columns before per-column strategies" },
              { key: "standardizeDates" as const, label: "Standardize date formats", desc: "Parse all date columns and output as YYYY-MM-DD" },
              { key: "flagOutliers" as const, label: "Flag statistical outliers", desc: "Mark values beyond 2.5σ with _outlier_flag columns" },
              { key: "addQualityScore" as const, label: "Add data quality score column", desc: "Append quality_score (0-100) based on null field count per row" },
              { key: "preserveOriginals" as const, label: "Preserve original columns with _original suffix", desc: "Duplicate modified columns as [col]_original before changes" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div>
                  <span className="text-sm text-foreground/80">{label}</span>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={cn("w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0",
                    settings[key] ? "bg-[#534AB7]" : "bg-secondary")}>
                  <motion.div animate={{ x: settings[key] ? 20 : 2 }}
                    className="w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5" />
                </button>
              </div>
            ))}
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-foreground/80">Missing value threshold</span>
                <span className="font-semibold text-primary">{settings.missingThreshold}%</span>
              </div>
              <input type="range" min={10} max={90} value={localThreshold}
                onChange={e => setLocalThreshold(Number(e.target.value))}
                className="w-full accent-[#534AB7]" />
              <p className="text-[10px] text-muted-foreground mt-1">Columns exceeding this % of missing values will auto-set to &quot;Drop rows&quot;</p>
            </div>
          </div>
        )}

        {/* ═══════════ Preview Changes Tab ═══════════ */}
        {activeTab === "preview" && (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Summary line */}
            {previewDiff && (
              <div className="px-5 py-3 border-b border-border/40 flex flex-wrap items-center gap-4">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">
                  {previewDiff.summary.cellChanges} cells will change · {previewDiff.summary.rowsDropped} rows will be dropped · {previewDiff.summary.newColumns} new columns will be added
                </span>
              </div>
            )}
            <div className="px-5 py-2 border-b border-border/40 text-xs text-muted-foreground">
              Showing {changedRows.length} rows with changes out of {dataset.rows.length} total
            </div>

            {changedRows.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                <table className="w-full data-table text-xs relative">
                  <thead className="sticky top-0 bg-[#0B0A1A] z-10 shadow-sm">
                    <tr>
                      <th className="w-12">#</th>
                      {previewDiff!.columns.map(c => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {changedRows.map(row => (
                      <tr key={row.rowIdx}>
                        <td className="text-muted-foreground">{row.rowIdx + 1}</td>
                        {previewDiff!.columns.map(col => {
                          const cell = row.cells[col];
                          if (!cell) return <td key={col}>—</td>;

                          // Dropped row
                          if (cell.changeType === "dropped") {
                            return <td key={col} className="line-through text-red-400 bg-red-500/5">{String(cell.original ?? "null")}</td>;
                          }
                          // New column added
                          if (cell.changeType === "custom") {
                            return <td key={col} style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }} className="font-semibold">+ {String(cell.cleaned ?? "true")}</td>;
                          }
                          // Custom value fill — teal
                          if (cell.changeType === "custom-fill") {
                            return (
                              <td key={col} style={{ background: "#0F3D38", color: "#5DCAA5" }}>
                                <span className="line-through opacity-50 mr-1">{String(cell.original ?? "null")}</span>
                                → {String(cell.cleaned ?? "")}
                              </td>
                            );
                          }
                          // Auto fill (mean/median/mode/zero) — purple
                          if (cell.changeType === "auto-fill") {
                            return (
                              <td key={col} style={{ background: "#1A1040", color: "#AFA9EC" }}>
                                <span className="line-through opacity-50 mr-1">{String(cell.original ?? "null")}</span>
                                → {String(cell.cleaned ?? "")}
                              </td>
                            );
                          }
                          // Fuzzy merge — amber
                          if (cell.changeType === "fuzzy-merge") {
                            return (
                              <td key={col} style={{ background: "#2D1F00", color: "#EF9F27" }}>
                                <span className="line-through opacity-50 mr-1">{String(cell.original ?? "")}</span>
                                → {String(cell.cleaned ?? "")}
                              </td>
                            );
                          }
                          // Generic changed
                          if (cell.changeType === "changed") {
                            return (
                              <td key={col} style={{ background: "#1A1040", color: "#AFA9EC" }}>
                                <span className="line-through opacity-50 mr-1">{String(cell.original ?? "null")}</span>
                                → {String(cell.cleaned ?? "")}
                              </td>
                            );
                          }
                          // Unchanged
                          return <td key={col}>{String(cell.original ?? "")}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">No changes detected with current settings.</div>
            )}

            {/* Legend */}
            <div className="px-5 py-3 border-t border-border/40 flex flex-wrap gap-4 text-[10px]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "#1A1040" }} /> Auto-filled (purple)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "#0F3D38" }} /> Custom value (teal)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "#2D1F00" }} /> Fuzzy merge (amber)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/20" /> Dropped row (red)</span>
            </div>
          </div>
        )}

        {/* ═══════════ Clean Report Tab ═══════════ */}
        {activeTab === "report" && (
          <div className="space-y-6">
            {!cleanedRows ? (
              <div className="glass rounded-2xl p-12 text-center text-muted-foreground">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Run cleaning to see the report.</p>
              </div>
            ) : (
              <>
                {/* Animated log */}
                <div className="glass rounded-2xl p-6 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-primary" />Cleaning Log</h3>
                  {log.length === 0 ? (
                    <div className="p-4 rounded-xl bg-secondary/30 border border-border/30 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      Data is already perfectly clean! No rules or settings were triggered.
                    </div>
                  ) : (
                    <AnimatePresence>
                      {log.slice(0, visibleLogIdx + 1).map((entry, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
                          {entry.icon === "check" && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                          {entry.icon === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                          {entry.icon === "info" && <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                          <span className="text-sm flex-1">{entry.description}</span>
                          <span className="stat-badge bg-primary/10 text-primary text-[10px]">{entry.rowsAffected} rows</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>

                {/* Summary card */}
                {cleanedRows && !cleaning && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-2xl p-6 border border-green-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <h3 className="font-bold">Cleaning Complete</h3>
                        <p className="text-xs text-muted-foreground">
                          Original rows: {dataset.rows.length} | Cleaned rows: {cleanedRows.length} | Changes made: {log.length} | Quality: 100/100
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => downloadCSV(cleanedRows, dataset.name.replace(/\.(csv|xlsx?)$/i, "_cleaned.csv"))}
                        className="btn-primary flex-1 justify-center">
                        <Download className="w-4 h-4" />Download Cleaned CSV
                      </button>
                      <button onClick={() => {
                        useStore.getState().setPendingPrompt(null);
                        router.push("/insights");
                      }} className="btn-outline flex-1 justify-center">
                        <Sparkles className="w-4 h-4" />Use Cleaned Dataset
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
