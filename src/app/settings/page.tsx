"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/store";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { useState } from "react";
import { User, Mail, Palette, Brain, Save, LogOut, Shield, Info, Sun, Moon } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/store/useHydrated";

const PROVIDERS = [
  { id: "auto", label: "Auto (Best Available)", desc: "OpenAI → Groq → Gemini fallback" },
  { id: "openai", label: "OpenAI GPT-4o-mini", desc: "Best reasoning, higher cost" },
  { id: "groq", label: "Groq (Llama 3.3-70B)", desc: "Fastest responses, free tier" },
  { id: "gemini", label: "Google Gemini Flash", desc: "Balanced speed and quality" },
];

export default function SettingsPage() {
  const hydrated = useHydrated();
  const { settings, updateSettings, datasets, reports } = useStore();
  const { theme, setTheme } = useTheme();
  const currentTheme = hydrated ? theme : "dark";
  const dsCount = hydrated ? datasets.length : 0;
  const rptCount = hydrated ? reports.length : 0;
  const [name, setName] = useState(settings.userName ?? "");
  const [email, setEmail] = useState(settings.userEmail ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    updateSettings({ userName: name, userEmail: email });
    setSaved(true);
    toast.success("Settings saved!");
    setTimeout(() => setSaved(false), 2000);
  };

  const clearAllData = () => {
    if (!confirm("This will remove all datasets, reports, and chat history. Continue?")) return;
    localStorage.removeItem("ai-data-assistant-store");
    window.location.reload();
  };

  return (
    <AppLayout title="Settings">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your preferences and account</p>
        </div>

        {/* Profile */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Profile</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #ec4899)" }}>
                {(name || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{name || "User"}</div>
                <div className="text-sm text-muted-foreground">{email || "No email set"}</div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Display Name</label>
              <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 border border-border/50"
                placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Email</label>
              <input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 border border-border/50"
                placeholder="your@email.com" />
            </div>
            <button onClick={save} id="settings-save" className="btn-primary">
              <Save className="w-4 h-4" />{saved ? "Saved!" : "Save Profile"}
            </button>
          </div>
        </motion.div>

        {/* Appearance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Appearance</h2>
          </div>
          <div className="p-5">
            <p className="text-xs text-muted-foreground mb-3">Theme</p>
            <div className="grid grid-cols-2 gap-3">
              {[{ id: "dark", label: "Dark Mode", icon: Moon }, { id: "light", label: "Light Mode", icon: Sun }].map(({ id, label, icon: Icon }) => (
                <button key={id} id={`theme-${id}`} onClick={() => setTheme(id)}
                  className={cn("flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                    currentTheme === id ? "border-primary bg-primary/10 text-primary" : "border-border/50 hover:border-primary/40 text-muted-foreground hover:text-foreground")}>
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* AI Provider */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">AI Provider</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-muted-foreground mb-4">Choose your preferred AI model. "Auto" will automatically try the best available provider.</p>
            {PROVIDERS.map((p) => (
              <button key={p.id} id={`provider-${p.id}`}
                onClick={() => updateSettings({ preferredProvider: p.id as typeof settings.preferredProvider })}
                className={cn("w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                  settings.preferredProvider === p.id ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/30")}>
                <div className={cn("w-2 h-2 rounded-full mt-1 flex-shrink-0", settings.preferredProvider === p.id ? "bg-primary" : "bg-border")} />
                <div>
                  <div className={cn("text-sm font-medium", settings.preferredProvider === p.id ? "text-primary" : "")}>{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                </div>
              </button>
            ))}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mt-4">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Add your API keys to <code className="text-primary">.env.local</code>: OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY</p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Data & Privacy</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="glass rounded-xl p-4">
                <div className="text-2xl font-bold text-primary">{dsCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Datasets stored</div>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="text-2xl font-bold text-primary">{rptCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Reports generated</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">All data is stored locally in your browser. No data is sent to external servers except for AI analysis (only schema and sample rows, never your full dataset).</p>
            
            <button onClick={clearAllData} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium">
              <LogOut className="w-4 h-4" />Clear All Local Data & Reset
            </button>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
