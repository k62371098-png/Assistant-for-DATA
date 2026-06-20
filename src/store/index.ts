"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dataset, ChatMessage, AppSettings, Insight, Report, DataStory, AIRecommendation } from "@/types";
import { generateId } from "@/lib/utils";

interface DataStore {
  // Dataset
  datasets: Dataset[];
  activeDatasetId: string | null;
  setActiveDataset: (id: string) => void;
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  getActiveDataset: () => Dataset | null;

  // Chat
  messages: Record<string, ChatMessage[]>; // keyed by datasetId
  pendingPrompt: string | null;
  setPendingPrompt: (prompt: string | null) => void;
  addMessage: (datasetId: string, message: ChatMessage) => void;
  updateMessage: (datasetId: string, id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: (datasetId: string) => void;

  // Insights
  insights: Record<string, Insight[]>;
  setInsights: (datasetId: string, insights: Insight[]) => void;

  // Reports
  reports: Report[];
  addReport: (report: Report) => void;
  removeReport: (id: string) => void;

  // Data Stories
  stories: Record<string, DataStory>;
  setStory: (datasetId: string, story: DataStory) => void;

  // AI Recommendations
  recommendations: Record<string, AIRecommendation[]>;
  setRecommendations: (datasetId: string, recs: AIRecommendation[]) => void;
  dismissRecommendation: (datasetId: string, recId: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // UI State
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
}

export const useStore = create<DataStore>()(
  persist(
    (set, get) => ({
      // Dataset
      datasets: [],
      activeDatasetId: null,
      setActiveDataset: (id) => set({ activeDatasetId: id }),
      addDataset: (dataset) =>
        set((s) => ({
          datasets: [dataset, ...s.datasets.filter((d) => d.id !== dataset.id)],
          activeDatasetId: dataset.id,
        })),
      removeDataset: (id) =>
        set((s) => ({
          datasets: s.datasets.filter((d) => d.id !== id),
          activeDatasetId:
            s.activeDatasetId === id
              ? s.datasets.find((d) => d.id !== id)?.id ?? null
              : s.activeDatasetId,
        })),
      updateDataset: (id, updates) =>
        set((s) => ({
          datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      getActiveDataset: () => {
        const s = get();
        return s.datasets.find((d) => d.id === s.activeDatasetId) ?? null;
      },

      // Chat
      messages: {},
      pendingPrompt: null,
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
      addMessage: (datasetId, message) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [datasetId]: [...(s.messages[datasetId] ?? []), message],
          },
        })),
      updateMessage: (datasetId, id, updates) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [datasetId]: (s.messages[datasetId] ?? []).map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          },
        })),
      clearMessages: (datasetId) =>
        set((s) => ({ messages: { ...s.messages, [datasetId]: [] } })),

      // Insights
      insights: {},
      setInsights: (datasetId, insights) =>
        set((s) => ({ insights: { ...s.insights, [datasetId]: insights } })),

      // Reports
      reports: [],
      addReport: (report) => set((s) => ({ reports: [report, ...s.reports] })),
      removeReport: (id) =>
        set((s) => ({ reports: s.reports.filter((r) => r.id !== id) })),

      // Data Stories
      stories: {},
      setStory: (datasetId, story) =>
        set((s) => ({ stories: { ...s.stories, [datasetId]: story } })),

      // AI Recommendations
      recommendations: {},
      setRecommendations: (datasetId, recs) =>
        set((s) => ({ recommendations: { ...s.recommendations, [datasetId]: recs } })),
      dismissRecommendation: (datasetId, recId) =>
        set((s) => ({
          recommendations: {
            ...s.recommendations,
            [datasetId]: (s.recommendations[datasetId] ?? []).map((r) =>
              r.id === recId ? { ...r, dismissed: true } : r
            ),
          },
        })),

      // Settings
      settings: {
        theme: "dark",
        preferredProvider: "auto",
        userName: "User",
        userEmail: "user@example.com",
      },
      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      // UI
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      isProcessing: false,
      setIsProcessing: (v) => set({ isProcessing: v }),
      activePanel: null,
      setActivePanel: (panel) => set({ activePanel: panel }),
    }),
    {
      name: "ai-data-assistant-store",
      partialize: (s) => ({
        datasets: s.datasets.map((d) => ({ ...d, rows: d.rows.slice(0, 100) })), // persist only preview
        activeDatasetId: s.activeDatasetId,
        pendingPrompt: s.pendingPrompt,
        settings: s.settings,
        reports: s.reports,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);

// Helper to create a new chat message
export function createMessage(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}
