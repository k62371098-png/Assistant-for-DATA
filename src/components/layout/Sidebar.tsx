"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Upload, MessageSquare, Lightbulb, FileText,
  Settings, ChevronLeft, ChevronRight, Database, Sparkles, X, History, ShieldCheck, LogOut
} from "lucide-react";
import { useStore } from "@/store";
import { cn, truncate } from "@/lib/utils";
import { useHydrated } from "@/store/useHydrated";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/clean", label: "Clean Data", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setActiveDataset, removeDataset } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const hydrated = useHydrated();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // Try to sign out from the server, but don't wait forever
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
      await Promise.race([supabase.auth.signOut(), timeout]);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      // Force local cleanup and redirect even if network fails
      localStorage.removeItem("ai-data-assistant-store");
      toast.success("Logged out successfully");
      router.push("/login");
    }
  };

  // Use defaults during SSR, actual persisted state after hydration
  const collapsed = hydrated ? sidebarCollapsed : false;
  const dsItems = hydrated ? datasets : [];
  const activeId = hydrated ? activeDatasetId : null;

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 260 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="glass-strong fixed left-0 top-0 h-screen z-40 flex flex-col overflow-hidden border-r border-border/50"
      style={{ minWidth: collapsed ? 68 : 260 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #ec4899)" }}>
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              <div className="font-bold text-sm leading-tight">AI Data</div>
              <div className="text-xs text-muted-foreground">Assistant Pro</div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={toggleSidebar}
          className="ml-auto p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          id="sidebar-toggle"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} id={`nav-${label.toLowerCase()}`}>
              <div className={cn("sidebar-item", active && "active")}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-sm"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </Link>
          );
        })}

        {/* Dataset history */}
        {!collapsed && dsItems.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/40">
            <div className="flex items-center gap-2 px-3 mb-2">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datasets</span>
            </div>
            {dsItems.slice(0, 5).map((ds) => (
              <div
                key={ds.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 text-xs",
                  activeId === ds.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                onClick={() => setActiveDataset(ds.id)}
                id={`dataset-${ds.id}`}
              >
                <Database className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 truncate">{truncate(ds.name, 20)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeDataset(ds.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border/40 space-y-2">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full rounded-xl transition-all duration-200",
            "text-muted-foreground hover:bg-red-500/10 hover:text-red-400 group"
          )}
          title="Sign Out"
        >
          <LogOut className="w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {!collapsed && (
          <div className="text-[10px] text-muted-foreground text-center pt-1">
            AI Data Assistant Pro v1.0
          </div>
        )}
      </div>
    </motion.aside>
  );
}
