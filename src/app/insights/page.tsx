"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/store";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Upload, TrendingUp, AlertTriangle, Search, Send, BarChart2, Zap, MessageSquare, Activity, Users, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/store/useHydrated";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { pickMeanCol, pickUniqueCol, countAnomalies, computeQualityScore, pearson, strengthLabel, detectAnomalies, buildQuestionChips, type AnomalyItem } from "@/lib/data/insightsHelpers";

type TabKey = "insights" | "correlations" | "anomalies" | "askdata";
type TagFilter = "all" | "pattern" | "distribution" | "warning" | "opportunity";
interface SmartInsight { title: string; tag: "pattern"|"distribution"|"warning"|"opportunity"; description: string; icon?: string; }
interface CorrelationRow { col1: string; col2: string; value: number; strength: "strong"|"moderate"|"weak"|"negligible"; }

const TAG_COLORS: Record<string,string> = { pattern:"bg-[#EEEDFE] text-[#3C3489]", distribution:"bg-[#E6F1FB] text-[#185FA5]", warning:"bg-[#FCEBEB] text-[#A32D2D]", opportunity:"bg-[#EAF3DE] text-[#3B6D11]" };
const TAG_ICONS: Record<string, React.ElementType> = { pattern: BarChart2, distribution: Activity, warning: AlertTriangle, opportunity: Zap };
const STR_COLORS: Record<string,string> = { strong:"bg-purple-500/15 text-purple-400", moderate:"bg-blue-500/15 text-blue-400", weak:"bg-teal-500/15 text-teal-400", negligible:"bg-slate-500/15 text-slate-400" };
const STR_BAR: Record<string,string> = { strong:"#534AB7", moderate:"#3b82f6", weak:"#14b8a6", negligible:"#64748b" };
const SEV_COLORS: Record<string,string> = { outlier:"bg-red-500/15 text-red-400", inconsistency:"bg-blue-500/15 text-blue-400", suspicious:"bg-amber-500/15 text-amber-400" };

export default function InsightsPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { updateDataset } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const ds = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;
  const [tab, setTab] = useState<TabKey>("insights");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [aiInsights, setAiInsights] = useState<SmartInsight[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [askInput, setAskInput] = useState("");

  // Stats
  const statsCards = useMemo(() => {
    if (!ds) return [];
    const mc = pickMeanCol(ds.schema.columns); const uc = pickUniqueCol(ds.schema.columns);
    const anom = countAnomalies(ds); const qs = computeQualityScore(ds);
    return [
      { label: mc ? `Mean ${mc.name}` : "Rows", value: mc?.mean?.toFixed(1) ?? ds.schema.rowCount.toLocaleString(), icon: TrendingUp, color: "text-blue-400" },
      { label: uc ? `Unique ${uc.name}` : "Columns", value: uc?.uniqueCount?.toString() ?? ds.schema.colCount.toString(), icon: Users, color: "text-purple-400" },
      { label: "Anomalies", value: anom.toLocaleString(), icon: AlertTriangle, color: anom > 0 ? "text-amber-400" : "text-green-400" },
      { label: "Quality Score", value: `${qs}/100`, icon: ShieldCheck, color: qs >= 80 ? "text-green-400" : "text-amber-400" },
    ];
  }, [ds]);

  // Correlations
  const correlations = useMemo((): CorrelationRow[] => {
    if (!ds) return [];
    const numCols = ds.schema.columns.filter(c => c.type === "number");
    const pairs: CorrelationRow[] = [];
    for (let i = 0; i < numCols.length; i++) {
      for (let j = i + 1; j < numCols.length; j++) {
        const xAll = ds.rows.map(r => ({ x: r[numCols[i].name], y: r[numCols[j].name] })).filter(p => !isNaN(Number(p.x)) && !isNaN(Number(p.y)));
        if (xAll.length < 3) continue;
        const x = xAll.map(p => Number(p.x)); const y = xAll.map(p => Number(p.y));
        const val = pearson(x, y);
        pairs.push({ col1: numCols[i].name, col2: numCols[j].name, value: +val.toFixed(3), strength: strengthLabel(val) });
      }
    }
    return pairs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [ds]);

  // Heatmap
  const heatmap = useMemo(() => {
    if (!ds) return null;
    const catCols = ds.schema.columns.filter(c => c.type === "string" && c.uniqueCount <= 15 && c.uniqueCount > 1)
      .sort((a, b) => b.uniqueCount - a.uniqueCount);
    if (catCols.length < 2) return null;
    const c1 = catCols[0], c2 = catCols[1];
    const v1 = [...new Set(ds.rows.map(r => String(r[c1.name] ?? "")))].slice(0, 8);
    const v2 = [...new Set(ds.rows.map(r => String(r[c2.name] ?? "")))].slice(0, 8);
    const counts: Record<string, Record<string, number>> = {}; let mx = 0;
    v1.forEach(a => { counts[a] = {}; v2.forEach(b => { counts[a][b] = 0; }); });
    ds.rows.forEach(r => { const a = String(r[c1.name] ?? ""), b = String(r[c2.name] ?? ""); if (counts[a]?.[b] !== undefined) { counts[a][b]++; mx = Math.max(mx, counts[a][b]); } });
    return { col1: c1.name, col2: c2.name, vals1: v1, vals2: v2, counts, maxCount: mx };
  }, [ds]);

  // Anomalies
  const anomalies = useMemo((): AnomalyItem[] => ds ? detectAnomalies(ds) : [], [ds]);

  // Question chips
  const chips = useMemo(() => ds ? buildQuestionChips(ds) : [], [ds]);

  // AI fetch
  const fetchAI = async () => {
    if (!ds) return;
    setAiLoading(true);
    try {
      const cols = ds.schema.columns.map(c => ({ name: c.name, type: c.type, nullCount: c.nullCount, nullPercent: c.nullPercent, uniqueCount: c.uniqueCount, mean: c.mean, std: c.std, min: c.min, max: c.max }));
      const stats = { rowCount: ds.schema.rowCount, missingPercent: ds.schema.missingPercent, qualityScore: ds.schema.qualityScore };
      const res = await fetch("/api/ai/smart-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: cols, stats, sampleRows: ds.rows.slice(0, 10), datasetName: ds.name }) });
      if (res.ok) {
        const data = await res.json();
        if (data.insights?.length) {
          setAiInsights(data.insights);
          toast.success("✓ AI Insights generated", { duration: 3000 });
        } else {
          // API returned empty insights (Anthropic key missing/invalid) — use rule-based fallback
          setAiInsights([]); // Ensure fallback insights display
          toast.success("Statistical insights loaded", { icon: "📊", duration: 3000 });
        }
      } else {
        setAiInsights([]); // Force fallback insights
        toast.error("AI service unavailable — showing statistical insights instead", { duration: 4000 });
      }
    } catch {
      setAiInsights([]); // Force fallback insights
      toast.error("AI service unavailable — showing statistical insights instead", { duration: 4000 });
    }
    finally { setAiLoading(false); }
  };

  useEffect(() => { if (ds && aiInsights.length === 0) fetchAI(); }, [ds?.id]);

  // Fallback insights
  const displayInsights = useMemo((): SmartInsight[] => {
    if (aiInsights.length > 0) return aiInsights;
    if (!ds) return [];
    const ins: SmartInsight[] = [];
    const { columns, missingPercent, duplicateCount, qualityScore } = ds.schema;
    if (missingPercent > 3) ins.push({ title: "Missing Data Pattern", tag: "warning", description: `${missingPercent.toFixed(1)}% missing values detected across the dataset.` });
    if (duplicateCount > 0) ins.push({ title: "Duplicate Records", tag: "warning", description: `${duplicateCount} duplicate rows found that may skew analysis.` });
    columns.filter(c => c.type === "number" && typeof c.std === "number" && typeof c.mean === "number" && c.std > 0).slice(0, 2).forEach(c => {
      const cv = ((c.std! / Math.abs(c.mean! || 1)) * 100);
      if (cv > 50) ins.push({ title: `High Variability: ${c.name}`, tag: "pattern", description: `CV of ${cv.toFixed(0)}% indicates significant spread in ${c.name}.` });
    });
    ins.push({ title: "Quality Assessment", tag: qualityScore >= 80 ? "opportunity" : "warning", description: `Data quality score: ${qualityScore}/100. ${qualityScore >= 80 ? "Ready for analysis." : "Consider cleaning first."}` });
    if (columns.filter(c => c.type === "number").length >= 2) ins.push({ title: "Correlation Opportunity", tag: "opportunity", description: `${columns.filter(c => c.type === "number").length} numeric columns available for correlation analysis.` });
    ins.push({ title: "Dataset Overview", tag: "distribution", description: `${ds.schema.rowCount} rows across ${ds.schema.colCount} columns. Types: ${columns.map(c => c.type).filter((v,i,a) => a.indexOf(v) === i).join(", ")}.` });
    return ins;
  }, [aiInsights, ds]);

  const filteredInsights = tagFilter === "all" ? displayInsights : displayInsights.filter(i => i.tag === tagFilter);

  const sendPrompt = (q: string) => {
    useStore.getState().setPendingPrompt(q);
    router.push("/chat");
  };

  const autoFixAnomalies = () => {
    if (!ds || anomalies.length === 0) return;
    const rows = ds.rows.map(r => ({ ...r }));
    let fixed = 0;
    anomalies.forEach(a => {
      if (a.severity === "outlier") {
        const col = ds.schema.columns.find(c => c.name === a.column);
        if (col) { const vals = rows.map(r => Number(r[col.name])).filter(n => !isNaN(n)).sort((a, b) => a - b); const mid = Math.floor(vals.length / 2); const med = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2; rows[a.index][a.column] = med; fixed++; }
      } else if (a.severity === "inconsistency") {
        const match = a.explanation.match(/Similar to: (.+)/); if (match) { rows[a.index][a.column] = match[1]; fixed++; }
      } else if (a.severity === "suspicious") { rows[a.index][a.column] = null; fixed++; }
    });
    updateDataset(ds.id, { rows });
    toast.success(`${fixed} anomalies fixed. Dataset updated.`);
  };

  if (!ds) return (
    <AppLayout title="Insights"><div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6"><Lightbulb className="w-9 h-9 text-primary" /></div>
      <h2 className="text-xl font-bold mb-2">No Dataset Loaded</h2>
      <p className="text-muted-foreground mb-6">Upload a dataset to generate AI-powered insights.</p>
      <Link href="/upload" className="btn-primary"><Upload className="w-4 h-4" />Upload Dataset</Link>
    </div></AppLayout>
  );

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "insights", label: "Smart Insights", icon: Lightbulb },
    { key: "correlations", label: "Correlations", icon: BarChart2 },
    { key: "anomalies", label: "Anomalies", icon: AlertTriangle },
    { key: "askdata", label: "Ask Data", icon: MessageSquare },
  ];

  return (
    <AppLayout title="Insights">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold gradient-text">AI Insights Engine</h1><p className="text-muted-foreground text-sm mt-1">{ds.name}</p></div>
          <button onClick={fetchAI} disabled={aiLoading} className="btn-outline">
            <RefreshCw className={cn("w-4 h-4", aiLoading && "animate-spin")} />{aiLoading ? "Analyzing…" : "Refresh with AI"}
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsCards.map(s => (<div key={s.label} className="kpi-card flex items-center gap-4"><div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0"><s.icon className={cn("w-5 h-5", s.color)} /></div><div><div className={cn("text-xl font-bold", s.color)}>{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div></div>))}
        </div>

        {/* Tab Bar */}
        <div className="flex flex-wrap gap-2 glass rounded-2xl p-1.5">
          {TABS.map(({ key, label, icon: Icon }) => (<button key={key} onClick={() => setTab(key)} className={cn("flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all", tab === key ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}><Icon className="w-4 h-4" />{label}</button>))}
        </div>

        {/* ═══ Smart Insights ═══ */}
        {tab === "insights" && (<div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all","pattern","distribution","warning","opportunity"] as TagFilter[]).map(f => (
              <button key={f} onClick={() => setTagFilter(f)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize", tagFilter === f ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground")}>{f === "all" ? "All" : f}</button>
            ))}
          </div>
          {aiLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {[1,2,3].map(i => (<div key={i} className="glass rounded-2xl p-5 border border-border/40 animate-pulse"><div className="flex gap-3"><div className="w-9 h-9 rounded-xl bg-secondary flex-shrink-0" /><div className="flex-1 space-y-3 pt-1"><div className="h-4 bg-secondary rounded w-1/3" /><div className="h-3 bg-secondary rounded w-full" /><div className="h-3 bg-secondary rounded w-5/6" /></div></div></div>))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {filteredInsights.map((ins, i) => {
                const Icon = TAG_ICONS[ins.tag] ?? Lightbulb;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className="glass rounded-2xl p-5 border border-border/40 hover:border-primary/30 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm truncate">{ins.title}</h3>
                          <span className={cn("stat-badge text-[10px]", TAG_COLORS[ins.tag])}>{ins.tag}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{ins.description}</p>
                        <button onClick={() => sendPrompt(`${ins.title}: ${ins.description}. Analyze this further using my dataset ${ds.name} which has ${ds.schema.rowCount} rows and columns: ${ds.schema.columns.map(c => c.name).join(", ")}.`)}
                          className="mt-3 text-xs font-medium text-primary flex items-center gap-1 hover:underline">Explore <ExternalLink className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          {!aiLoading && filteredInsights.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">No insights match this filter. Try &quot;All&quot;.</div>}
        </div>)}

        {/* ═══ Correlations ═══ */}
        {tab === "correlations" && (<div className="space-y-6">
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /><span className="text-sm font-semibold">Pearson Correlations</span></div>
              <button onClick={() => sendPrompt(`Explain what these correlations mean in my dataset ${ds.name}: ${correlations.slice(0,3).map(c => `${c.col1} ↔ ${c.col2} (r=${c.value})`).join(", ")}`)} className="btn-outline !py-1.5 !px-3 text-xs">Interpret correlations <ExternalLink className="w-3 h-3" /></button>
            </div>
            {correlations.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">Need at least 2 numeric columns.</div> : (
              <div className="divide-y divide-border/30">
                {correlations.map((c, i) => (<div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/20 transition-colors">
                  <div className="w-48 text-sm font-medium truncate">{c.col1} ↔ {c.col2}</div>
                  <div className="flex-1 h-3 bg-secondary/40 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.abs(c.value) * 100}%`, background: STR_BAR[c.strength] }} /></div>
                  <span className="text-sm font-mono w-16 text-right">{c.value}</span>
                  <span className={cn("stat-badge text-[10px] w-24 justify-center", STR_COLORS[c.strength])}>{c.strength}</span>
                </div>))}
              </div>
            )}
          </div>
          {heatmap && (<div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold mb-4">{heatmap.col1} × {heatmap.col2} Heatmap</h3>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-2"></th>{heatmap.vals2.map(v => <th key={v} className="p-2 text-muted-foreground font-medium truncate max-w-[80px]">{v}</th>)}</tr></thead>
              <tbody>{heatmap.vals1.map(v1 => (<tr key={v1}><td className="p-2 font-medium text-muted-foreground truncate max-w-[100px]">{v1}</td>
                {heatmap.vals2.map(v2 => { const count = heatmap.counts[v1]?.[v2] ?? 0; const intensity = heatmap.maxCount > 0 ? count / heatmap.maxCount : 0;
                  return <td key={v2} className="p-2 text-center rounded" style={{ background: `rgba(83,74,183,${0.1+intensity*0.7})`, color: intensity > 0.5 ? "#fff" : "#a5a3c7" }}>{count}</td>;
                })}</tr>))}</tbody></table></div>
          </div>)}
        </div>)}

        {/* ═══ Anomalies ═══ */}
        {tab === "anomalies" && (<div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold">{anomalies.length} Anomalies Detected</span></div>
            <div className="flex gap-2">
              <button onClick={autoFixAnomalies} className="btn-outline !py-1.5 !px-3 text-xs">Auto-fix all <ExternalLink className="w-3 h-3" /></button>
              <button onClick={() => sendPrompt(`Explain these anomalies found in my dataset ${ds.name} and suggest what to do: ${anomalies.slice(0,10).map(a => `${a.column} row ${a.index+1}: ${a.value} (${a.explanation})`).join("; ")}`)} className="btn-outline !py-1.5 !px-3 text-xs">Explain <ExternalLink className="w-3 h-3" /></button>
            </div>
          </div>
          {anomalies.length === 0 ? <div className="py-12 text-center text-muted-foreground"><ShieldCheck className="w-10 h-10 mx-auto mb-3 text-green-400 opacity-60" /><p>No anomalies detected!</p></div> : (
            <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
              {anomalies.slice(0, 50).map((a, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-3 md:w-1/4">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", a.severity === "outlier" ? "bg-red-500/10" : a.severity === "inconsistency" ? "bg-blue-500/10" : "bg-amber-500/10")}>
                      <AlertTriangle className={cn("w-3.5 h-3.5", a.severity === "outlier" ? "text-red-500" : a.severity === "inconsistency" ? "text-blue-500" : "text-amber-500")} />
                    </div>
                    <div><div className="text-sm font-medium">{a.column}</div><div className="text-[10px] text-muted-foreground">Row {a.index + 1}</div></div>
                  </div>
                  <div className="text-sm font-mono text-red-400 md:w-24">{String(a.value)}</div>
                  <div className="flex-1 text-xs text-muted-foreground">{a.explanation}</div>
                  <span className={cn("stat-badge text-[10px]", SEV_COLORS[a.severity])}>{a.severity}</span>
                  <div className="flex items-end gap-0.5 h-6 w-20">{Array.from({ length: 8 }, (_, j) => {
                    const isA = j === 5;
                    return <div key={j} className="flex-1 rounded-sm" style={{ height: `${isA ? 100 : 30 + Math.random() * 40}%`, background: isA ? "#ef4444" : "rgba(83,74,183,0.3)" }} />;
                  })}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>)}

        {/* ═══ Ask Data ═══ */}
        {tab === "askdata" && (<div className="space-y-4">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" />Quick Questions</h3>
            <div className="flex flex-wrap gap-2">
              {chips.map((q, i) => (
                <button key={i} onClick={() => sendPrompt(`${q}. Answer using my dataset ${ds.name} which has columns: ${ds.schema.columns.map(c => c.name).join(", ")}`)}
                  className="px-3 py-2 rounded-xl text-xs border border-border/50 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all text-left">{q}</button>
              ))}
            </div>
          </div>
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-primary" />Ask anything about your data</h3>
            <div className="flex gap-3 items-end">
              <input value={askInput} onChange={e => setAskInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && askInput.trim()) { sendPrompt(`${askInput}. Answer using my dataset ${ds.name} which has columns: ${ds.schema.columns.map(c => c.name).join(", ")}`); setAskInput(""); } }}
                placeholder="Ask anything about your data…"
                className="flex-1 bg-secondary/60 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50" />
              <button onClick={() => { if (askInput.trim()) { sendPrompt(`${askInput}. Answer using my dataset ${ds.name} which has columns: ${ds.schema.columns.map(c => c.name).join(", ")}`); setAskInput(""); } }}
                className="btn-primary py-3 px-5"><Send className="w-4 h-4" />Ask</button>
            </div>
          </div>
        </div>)}
      </div>
    </AppLayout>
  );
}
