"use client";
import { Moon, Sun, Bell, Search, Database } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/store/useHydrated";

export function Header({ title }: { title?: string }) {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const { sidebarCollapsed } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);

  // Use defaults during SSR, actual persisted values after hydration
  const collapsed = hydrated ? sidebarCollapsed : false;
  const activeDataset = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;
  const dsCount = hydrated ? datasets.length : 0;
  const currentTheme = hydrated ? theme : "dark";

  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 glass-strong border-b border-border/50 flex items-center px-6 gap-4 transition-all duration-300"
      style={{ left: collapsed ? 68 : 260 }}
    >
      {/* Title */}
      <div className="flex-1">
        {title && (
          <h1 className="text-lg font-bold gradient-text">{title}</h1>
        )}
        {activeDataset && !title && (
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
              {activeDataset.name}
            </span>
            <span className="badge-info">
              {activeDataset.schema.rowCount.toLocaleString()} rows
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <motion.button
          id="theme-toggle"
          onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
          className="p-2 rounded-xl hover:bg-secondary transition-all duration-200 text-muted-foreground hover:text-foreground"
          whileTap={{ scale: 0.9 }}
          title={currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          <motion.div
            initial={false}
            animate={{ rotate: currentTheme === "dark" ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            {currentTheme === "dark" ? (
              <Sun className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            ) : (
              <Moon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            )}
          </motion.div>
        </motion.button>

        {/* Dataset count pill */}
        {dsCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <Database className="w-3.5 h-3.5" />
            <span>{dsCount} dataset{dsCount > 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Status dot */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground">
          <div className="pulse-dot" />
          <span>Online</span>
        </div>
      </div>
    </header>
  );
}
