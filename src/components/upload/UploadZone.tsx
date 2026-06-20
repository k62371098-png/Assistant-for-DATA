"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, Database } from "lucide-react";
import { parseFile } from "@/lib/data/parser";
import { uploadDatasetFile, saveDatasetMetadata } from "@/lib/supabase/db";
import { useStore } from "@/store";
import { formatBytes, cn } from "@/lib/utils";
import toast from "react-hot-toast";

const ACCEPTED = { "text/csv": [".csv"], "text/tab-separated-values": [".tsv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"], "application/json": [".json"], "text/plain": [".txt"] };

interface Props { onSuccess?: (datasetId: string) => void; }

export function UploadZone({ onSuccess }: Props) {
  const [status, setStatus] = useState<"idle" | "parsing" | "analyzing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const { addDataset, updateDataset } = useStore();

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);
    setStatus("parsing");
    setErrorMsg("");

    try {
      // 1. Parse file locally
      const dataset = await parseFile(file);
      dataset.size = file.size;
      addDataset(dataset);
      setStatus("analyzing");

      // 1b. Background Supabase Sync (Non-blocking)
      try {
        const filePath = await uploadDatasetFile(file, dataset.id);
        await saveDatasetMetadata(dataset, filePath);
      } catch (err) {
        console.warn("Failed to sync to Supabase:", err);
      }

      // 2. Get AI explanation + insights
      try {
        const res = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: dataset.schema,
            sampleRows: dataset.rows.slice(0, 20),
          }),
        });
        if (res.ok) {
          const { explanation, aiInsights } = await res.json();
          updateDataset(dataset.id, {
            schema: { ...dataset.schema, aiExplanation: explanation, suggestions: [] },
          });
          if (aiInsights?.length) {
            useStore.getState().setInsights(dataset.id, aiInsights);
          }
        }
      } catch (e) {
        console.warn("AI insights failed (non-critical):", e);
      }

      setStatus("done");
      toast.success(`${file.name} loaded — ${dataset.schema.rowCount.toLocaleString()} rows`);
      onSuccess?.(dataset.id);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to parse file");
      toast.error("Upload failed");
    }
  }, [addDataset, updateDataset, onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED, maxFiles: 1, maxSize: 100 * 1024 * 1024,
  });

  const reset = () => { setStatus("idle"); setErrorMsg(""); setFileName(""); };

  return (
    <div>
      <div {...getRootProps()} className={cn("upload-zone p-12 text-center", isDragActive && "dragging")}>
        <input {...getInputProps()} id="file-upload-input" />
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="flex justify-center mb-4">
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center transition-all", isDragActive ? "glow" : "")} style={{ background: "linear-gradient(135deg, hsl(252,87%,67%,0.2), hsl(330,81%,67%,0.1))" }}>
                  <Upload className={cn("w-7 h-7 text-primary transition-transform", isDragActive && "scale-110")} />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">{isDragActive ? "Drop it here!" : "Drop your dataset here"}</h3>
              <p className="text-muted-foreground text-sm mb-4">or click to browse files</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["CSV", "Excel (.xlsx)", "JSON", "TSV"].map((fmt) => (
                  <span key={fmt} className="badge-info">{fmt}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Maximum file size: 100 MB</p>
            </motion.div>
          )}

          {(status === "parsing" || status === "analyzing") && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
              </div>
              <div>
                <p className="font-semibold">{status === "parsing" ? "Parsing your dataset…" : "🤖 AI is analyzing…"}</p>
                <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
              </div>
              <div className="w-48 mx-auto h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary rounded-full" initial={{ width: "0%" }} animate={{ width: status === "parsing" ? "50%" : "90%" }} transition={{ duration: 1 }} />
              </div>
              <p className="text-xs text-muted-foreground">{status === "analyzing" ? "Generating insights with AI…" : "Reading file structure…"}</p>
            </motion.div>
          )}

          {status === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-green-400" />
                </div>
              </div>
              <p className="font-semibold text-green-400">Dataset ready!</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="btn-ghost text-xs mt-2">Upload another</button>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-red-400" />
                </div>
              </div>
              <p className="font-semibold text-red-400">Upload failed</p>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="btn-outline text-xs mt-2">Try again</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
