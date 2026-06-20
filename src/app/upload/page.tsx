"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { UploadZone } from "@/components/upload/UploadZone";
import { useStore } from "@/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Database, Trash2, Eye, FileText, BarChart2 } from "lucide-react";
import { formatBytes, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { useHydrated } from "@/store/useHydrated";

export default function UploadPage() {
  const hydrated = useHydrated();
  const { datasets, removeDataset, setActiveDataset } = useStore();
  const visibleDatasets = hydrated ? datasets : [];
  const router = useRouter();

  return (
    <AppLayout title="Upload Dataset">
      <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold gradient-text mb-1">Upload Your Dataset</h1>
          <p className="text-muted-foreground text-sm">Supports CSV, Excel (.xlsx/.xls), JSON, and TSV files up to 100MB</p>
        </div>

        <UploadZone onSuccess={(id) => { setActiveDataset(id); router.push("/dashboard"); }} />

        {/* Sample data button */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Don't have a dataset? Try our sample:</p>
          <button
            id="load-sample-btn"
            onClick={async () => {
              const { parseFile } = await import("@/lib/data/parser");
              const res = await fetch("/sample_data.csv");
              const text = await res.text();
              const file = new File([text], "sample_sales_data.csv", { type: "text/csv" });
              const { parseCsvText } = await import("@/lib/data/parser");
              const ds = await parseCsvText(text, "sample_sales_data.csv");
              useStore.getState().addDataset(ds);
              router.push("/dashboard");
            }}
            className="btn-outline"
          >
            <FileText className="w-4 h-4" /> Load Sample Dataset
          </button>
        </div>

        {/* Dataset history */}
        {visibleDatasets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Loaded Datasets ({visibleDatasets.length})</h2>
            </div>
            <div className="divide-y divide-border/40">
              {visibleDatasets.map((ds) => (
                <div key={ds.id} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Database className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{ds.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatNumber(ds.schema.rowCount)} rows · {ds.schema.colCount} columns
                      {ds.size ? ` · ${formatBytes(ds.size)}` : ""}
                      · {new Date(ds.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`stat-badge ${ds.schema.qualityScore >= 80 ? "badge-success" : "badge-warning"}`}>
                      {ds.schema.qualityScore}/100
                    </span>
                    <button
                      onClick={() => { setActiveDataset(ds.id); router.push("/dashboard"); }}
                      className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                      title="View Dashboard"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeDataset(ds.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
