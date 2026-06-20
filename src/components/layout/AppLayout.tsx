"use client";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useStore } from "@/store";
import { useHydrated } from "@/store/useHydrated";

export function AppLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { sidebarCollapsed } = useStore();
  const hydrated = useHydrated();

  // Use defaults during SSR, actual persisted state after hydration
  const collapsed = hydrated ? sidebarCollapsed : false;

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main
        className="flex-1 transition-all duration-300 min-h-screen"
        style={{ marginLeft: collapsed ? 68 : 260, paddingTop: 64 }}
      >
        <Header title={title} />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
