"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useStore } from "@/store";
import { motion } from "framer-motion";
import { Upload, Database, Trash2 } from "lucide-react";
import Link from "next/link";
import { useHydrated } from "@/store/useHydrated";

export default function ChatPage() {
  const hydrated = useHydrated();
  const { clearMessages } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const dataset = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;

  return (
    <AppLayout title="Chat">
      <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-fade-in">
        {/* Context bar */}
        <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3 mb-4">
          <div className={`w-2.5 h-2.5 rounded-full ${dataset ? "bg-green-400" : "bg-amber-400"} animate-pulse`} />
          <span className="text-sm font-medium">
            {dataset ? (
              <>Analyzing <span className="text-primary">{dataset.name}</span> · {dataset.schema.rowCount.toLocaleString()} rows</>
            ) : (
              <span className="text-muted-foreground">No dataset — general chat mode</span>
            )}
          </span>
          {dataset && (
            <div className="ml-auto flex items-center gap-2">
              <span className="badge-info text-xs">{dataset.schema.colCount} columns</span>
              <button
                onClick={() => activeDatasetId && clearMessages(activeDatasetId)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {!dataset && (
            <Link href="/upload" className="ml-auto btn-primary text-xs !py-1.5">
              <Upload className="w-3.5 h-3.5" />Upload Dataset
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-hidden glass rounded-2xl p-4">
          <ChatPanel />
        </div>
      </div>
    </AppLayout>
  );
}
