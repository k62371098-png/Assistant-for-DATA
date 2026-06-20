"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/store";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Loader2, Plus, Trash2, Upload, BarChart2, BookOpen, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { buildDashboardCharts } from "@/lib/data/analyzer";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { generateId } from "@/lib/utils";
import type { Report } from "@/types";
import Link from "next/link";
import toast from "react-hot-toast";
import { useHydrated } from "@/store/useHydrated";

export default function ReportsPage() {
  const hydrated = useHydrated();
  const { getActiveDataset, reports, addReport, removeReport, insights, stories } = useStore();
  const dataset = hydrated ? getActiveDataset() : null;
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const generateReport = async () => {
    if (!dataset) return;
    setGenerating(true);
    try {
      const datasetInsights = insights[dataset.id] ?? [];
      const story = stories[dataset.id];
      
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetName: dataset.name,
          schema: dataset.schema,
          insights: datasetInsights,
        }),
      });
      const { report: aiReport } = await res.json();
      
      const newReport: Report = {
        id: generateId(),
        title: aiReport.title ?? `Executive Report: ${dataset.name}`,
        datasetName: dataset.name,
        createdAt: new Date().toISOString(),
        executiveSummary: aiReport.summary,
        sections: [
          { id: "findings", title: "Key Findings", content: (aiReport.keyFindings ?? []).join("\n\n") },
          { id: "recommendations", title: "Strategic Recommendations", content: (aiReport.recommendations ?? []).join("\n\n") },
          { id: "conclusion", title: "Conclusion", content: aiReport.conclusion ?? "" },
        ],
        insights: datasetInsights,
        story: story,
      };
      addReport(newReport);
      setExpandedId(newReport.id);
      toast.success("Executive Report generated successfully!");
    } catch (e) {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const downloadPDF = async (report: Report, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(report.id);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", format: "a4" });
      let y = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;

      // Header Design
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pageWidth, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 50);
      const titleLines = doc.splitTextToSize(report.title, maxWidth);
      doc.text(titleLines, margin, y + 10);
      y += titleLines.length * 10 + 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 140);
      doc.text(`Dataset: ${report.datasetName}   |   Generated: ${new Date(report.createdAt).toLocaleDateString()}`, margin, y);
      y += 15;

      doc.setDrawColor(230, 230, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      // Executive Summary
      if (report.executiveSummary) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text("Executive Summary", margin, y);
        y += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(70, 70, 85);
        const lines = doc.splitTextToSize(report.executiveSummary, maxWidth);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 12;
      }

      // Sections
      for (const section of report.sections) {
        if (!section.content) continue;
        if (y > 240) { doc.addPage(); y = 20; }
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text(section.title, margin, y);
        y += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(70, 70, 85);
        
        // Handle bullet points
        const contentLines = section.content.split("\n\n");
        for (const line of contentLines) {
          if (y > 260) { doc.addPage(); y = 20; }
          const formattedLine = line.trim().startsWith("-") || line.trim().match(/^\d+\./) 
            ? line.trim() 
            : `• ${line.trim()}`;
          const lines = doc.splitTextToSize(formattedLine, maxWidth - 5);
          doc.text(lines, margin + 5, y);
          y += lines.length * 5 + 3;
        }
        y += 8;
      }

      // Data Story Highlights
      if (report.story && report.story.steps.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text("Data Story Highlights", margin, y);
        y += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(70, 70, 85);
        
        for (const step of report.story.steps.slice(0, 3)) {
          if (y > 260) { doc.addPage(); y = 20; }
          doc.setFont("helvetica", "bold");
          doc.text(step.title, margin + 5, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          const plainNarrative = step.narrative.replace(/\*\*(.*?)\*\*/g, "$1");
          const lines = doc.splitTextToSize(plainNarrative, maxWidth - 5);
          doc.text(lines, margin + 5, y);
          y += lines.length * 5 + 6;
        }
      }

      // Footer
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 160);
        doc.text(`Page ${i} of ${pageCount} - AI Data Assistant Pro`, margin, doc.internal.pageSize.getHeight() - 10);
      }

      doc.save(`${report.title.replace(/[^a-z0-9]/gi, "_")}.pdf`);
      toast.success("PDF downloaded!");
    } catch (e) {
      toast.error("PDF generation failed");
    } finally {
      setDownloading(null);
    }
  };

  if (!dataset) {
    return (
      <AppLayout title="Reports">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <FileText className="w-9 h-9 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dataset Loaded</h2>
          <p className="text-muted-foreground mb-6">Upload a dataset to generate comprehensive reports.</p>
          <Link href="/upload" className="btn-primary"><Upload className="w-4 h-4" />Upload Dataset</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Reports">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Executive Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">{dataset.name}</p>
          </div>
          <button onClick={generateReport} disabled={generating} className="btn-primary shadow-lg shadow-primary/20">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {generating ? "Generating AI Report…" : "Generate New Report"}
          </button>
        </div>

        {/* Live preview of current dataset charts */}
        <div className="glass rounded-2xl p-6 border border-border/40">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />Dataset Snapshot
            </h2>
            <Link href="/dashboard" className="text-xs text-primary hover:underline">View Full Dashboard</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {buildDashboardCharts(dataset).slice(0, 2).map((r, i) => (
              <div key={i} className="chart-container bg-secondary/20">
                <h3 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{r.plan.title}</h3>
                <ChartRenderer result={r} height={220} />
              </div>
            ))}
          </div>
        </div>

        {/* Reports list */}
        {reports.length === 0 ? (
          <div className="text-center py-16 glass rounded-2xl border border-dashed border-border/60">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium mb-2">No reports generated</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Click the "Generate New Report" button to create an AI-powered executive summary of your dataset.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-2">Generated Reports ({reports.length})</h2>
            <div className="space-y-4">
              <AnimatePresence>
                {reports.map((report) => {
                  const isExpanded = expandedId === report.id;
                  return (
                    <motion.div 
                      key={report.id} 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, height: 0 }}
                      className="glass rounded-2xl overflow-hidden border border-border/50 transition-all hover:border-primary/30 shadow-sm"
                    >
                      {/* Header (Clickable) */}
                      <div 
                        onClick={() => setExpandedId(isExpanded ? null : report.id)}
                        className="px-6 py-5 flex items-center gap-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base truncate">{report.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">Generated {new Date(report.createdAt).toLocaleString()} · {report.datasetName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={(e) => downloadPDF(report, e)} 
                            disabled={downloading === report.id} 
                            className="btn-primary !px-4 !py-2 text-xs"
                          >
                            {downloading === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Export PDF
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeReport(report.id); }} 
                            className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-px h-6 bg-border/50 mx-1" />
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </div>

                      {/* Content (Expanded) */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: "auto", opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border/40 bg-secondary/5"
                          >
                            <div className="p-6 space-y-8">
                              {report.executiveSummary && (
                                <div>
                                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Executive Summary</h4>
                                  <p className="text-sm text-foreground/80 leading-relaxed bg-primary/5 p-4 rounded-xl border border-primary/10">
                                    {report.executiveSummary}
                                  </p>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {report.sections.filter((s) => s.content).map((section) => (
                                  <div key={section.id}>
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{section.title}</h4>
                                    <div className="space-y-3">
                                      {section.content.split("\n\n").map((para, i) => (
                                        <div key={i} className="flex gap-2.5 items-start">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 flex-shrink-0" />
                                          <p className="text-sm text-foreground/80 leading-relaxed">
                                            {para.replace(/^-/, "").trim()}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
