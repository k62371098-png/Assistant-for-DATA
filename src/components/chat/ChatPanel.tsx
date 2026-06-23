"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, Sparkles, MessageSquare, Lightbulb, Zap } from "lucide-react";
import { useStore, createMessage } from "@/store";
import { useHydrated } from "@/store/useHydrated";
import { ChartRenderer, ChartConfig } from "@/components/chat/ChatChartRenderer";
import { DataEngine, extractIntent } from "@/lib/data/engine";
import type { ChatMessage } from "@/types";
import { cn, generateId } from "@/lib/utils";

export function ChatPanel() {
  const hydrated = useHydrated();
  const { messages, addMessage, updateMessage, pendingPrompt, setPendingPrompt } = useStore();
  const activeDatasetId = useStore((s) => s.activeDatasetId);
  const datasets = useStore((s) => s.datasets);
  const dataset = hydrated ? datasets.find((d) => d.id === activeDatasetId) ?? null : null;
  const datasetId = dataset?.id ?? "__general__";
  const chatMessages = messages[datasetId] ?? [];

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dataEngine = useMemo(() => dataset ? new DataEngine(dataset) : null, [dataset]);

  const suggestedPrompts = useMemo(() => {
    if (!dataset) return [
      "Show top 10 rows by highest value",
      "Create a bar chart grouped by category",
      "What are the key trends in this dataset?",
      "Show distribution as a pie chart",
    ];
    const numCol = dataset.schema.columns.find(c => c.type === 'number')?.name || 'value';
    const catCol = dataset.schema.columns.find(c => c.type === 'string' && c.uniqueCount > 1)?.name || 'category';
    
    return [
      `How many rows and columns?`,
      `Show me the top 5 by ${numCol}`,
      `Find any missing values`,
      `Are there any anomalies in ${numCol}?`,
      `Search for "example"`,
      `Show distribution as a chart`
    ];
  }, [dataset]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, isLoading]);

  useEffect(() => {
    if (pendingPrompt && !isLoading) {
      const q = pendingPrompt;
      setPendingPrompt(null);
      setTimeout(() => sendMessage(q), 100);
    }
  }, [pendingPrompt, isLoading]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;
    setInput("");
    
    const userMsg = createMessage("user", question);
    addMessage(datasetId, userMsg);

    if (!dataset || !dataEngine) {
      // General chat fallback
      setIsLoading(true);
      const assistantId = generateId();
      addMessage(datasetId, createMessage("assistant", "Thinking…", { id: assistantId, isStreaming: true }));
      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, context: "No dataset loaded.", history: [] }),
        });
        const { answer } = await res.json();
        updateMessage(datasetId, assistantId, { content: answer ?? "I couldn't generate a response.", isStreaming: false });
      } catch {
        updateMessage(datasetId, assistantId, { content: "Error communicating with AI.", isStreaming: false });
      }
      setIsLoading(false);
      return;
    }

    // Advanced Data Engine Routing
    const intent = extractIntent(question, dataEngine);
    const instantTypes = ["metadata", "value_search", "column_lookup", "row_lookup", "missing_values", "anomaly_scan", "top_n", "bottom_n", "middle_n", "chart_request", "random_row", "random_column"];

    if (instantTypes.includes(intent.type)) {
      // INSTANT RESOLUTION
      const assistantId = generateId();
      let answer = "";
      let chartConfig: ChartConfig | undefined;
      let chartData: any[] = [];
      let dataTable: any = undefined;
      let followUps: string[] = [];

      try {
        if (intent.type === "metadata") {
          const meta = dataEngine.getMetadata();
          answer = `Your dataset "${meta.datasetName}" has **${meta.rowCount.toLocaleString()} rows** and **${meta.columnCount} columns**.`;
          
          const maxRows = 500;
          const previewRows = dataEngine.rows.slice(0, maxRows);
          const colNames = meta.columns.map(c => c.name);
          const vals = previewRows.map(row => colNames.map(c => row[c]));
          dataTable = { show: true, columns: colNames, rows: vals };
          
          if (dataEngine.rows.length > maxRows) {
            answer += ` Here are the first ${maxRows} rows for performance:`;
          } else {
            answer += ` Here is all the data:`;
          }
          followUps = ["Show missing values", "Find anomalies"];
        } else if (intent.type === "top_n" || intent.type === "bottom_n" || intent.type === "middle_n") {
          const count = intent.count || 5;
          const target = intent.target || dataEngine.columns.find(c => c.type === 'number')?.name || dataEngine.columns[0].name;
          const pos = intent.type.split("_")[0] as any;
          const slice = dataEngine.getRankedSlice(target, pos, count);
          
          if (slice.length > 0) {
            const first = (slice[0] as any)[target];
            const last = (slice[slice.length - 1] as any)[target];
            answer = `The ${pos} ${count} by ${target} ranges from **${first}** down to **${last}**.`;
            chartConfig = {
              type: "horizontal_bar",
              title: `${pos.toUpperCase()} ${count} by ${target}`,
              xField: dataEngine.getIdColumn(),
              yField: target,
              colorScheme: "single"
            };
            chartData = slice;
            
            // Render table as well
            const cols = Object.keys(slice[0]).filter(k => !k.startsWith('_'));
            const vals = slice.map(row => cols.map(c => (row as any)[c]));
            dataTable = { show: true, columns: cols, rows: vals };
            
          } else {
            answer = `I couldn't find any numeric data to rank in column "${target}".`;
          }
          followUps = [`Show ${pos === 'top' ? 'bottom' : 'top'} ${count} instead`, "Show missing values"];
        } else if (intent.type === "value_search") {
          const term = intent.term || "";
          const result = dataEngine.searchValue(term);
          if (result.found) {
            if (result.exact) {
              answer = `Yes — exact match for **"${term}"** was found in column **${result.locations!.column}** (in ${result.locations!.rowIndices.length} rows). Here are the details:`;
              const rowsData = result.locations!.rowIndices.slice(0, 50).map(idx => dataEngine.rows[idx]);
              const cols = dataEngine.columns.map(c => c.name);
              dataTable = { show: true, columns: cols, rows: rowsData.map(r => cols.map(c => r[c])) };
            } else {
              answer = `I didn't find an exact match for "${term}", but found similar values like **"${result.suggestions?.[0]?.value}"**.`;
            }
          } else {
            answer = `No, **"${term}"** does not appear anywhere in this dataset.`;
          }
        } else if (intent.type === "missing_values") {
          const missing = dataEngine.findMissingValues();
          const keys = Object.keys(missing);
          if (keys.length > 0) {
            answer = `Found missing values across **${keys.length} columns**: \n` + keys.map(k => `- ${k}: ${missing[k].count} missing`).join("\n");
            followUps = ["Fix these in Clean Data →"];
          } else {
            answer = `Great news! I didn't find any missing values in this dataset.`;
          }
        } else if (intent.type === "anomaly_scan") {
          const anomalies = dataEngine.findAnomalies();
          if (anomalies.length > 0) {
            answer = `Found **${anomalies.length} potential anomalies**. For example, in row ${anomalies[0].rowIdentifier}, ${anomalies[0].column} is ${anomalies[0].value} (${anomalies[0].deviation} deviation).`;
            followUps = ["Highlight in dataset →", "Show missing values"];
          } else {
            answer = `No statistical anomalies found in numeric columns.`;
          }
        } else if (intent.type === "chart_request") {
          const numCols = dataEngine.columns.filter(c => c.type === "number");
          const catCols = dataEngine.columns.filter(c => c.type === "string");
          const requestedType = intent.chartType || "bar";
          
          if (numCols.length >= 1) {
             const idCol = dataEngine.getIdColumn();
             const yCol = numCols[0].name;
             
             // For pie/donut, prefer a categorical column with reasonable cardinality as xField
             let xCol = idCol;
             if (requestedType === "pie" || requestedType === "donut") {
               // Find a good categorical column (not the numeric column itself)
               const bestCatCol = catCols.find(c => 
                 c.name !== yCol && c.uniqueCount && c.uniqueCount > 1 && c.uniqueCount <= 30
               ) || catCols.find(c => c.name !== yCol);
               
               if (bestCatCol) {
                 xCol = bestCatCol.name;
               }
             }
             
             // Ensure xCol and yCol are not the same for meaningful charts
             if (xCol === yCol) {
               // Try to find an alternative
               const altCol = catCols.find(c => c.name !== yCol) 
                 || dataEngine.columns.find(c => c.name !== yCol);
               if (altCol) xCol = altCol.name;
             }
             
             chartConfig = {
              type: requestedType as any,
              title: xCol !== yCol ? `${yCol} by ${xCol}` : `Distribution of ${xCol}`,
              xField: xCol,
              yField: xCol !== yCol ? yCol : undefined,
              colorScheme: requestedType === "pie" || requestedType === "donut" ? "categorical" : "single"
             };
             
             if (requestedType === "pie" || requestedType === "donut") {
               if (xCol !== yCol) {
                 // Aggregate data by xCol, summing yCol values
                 const aggregated: Record<string, number> = {};
                 dataEngine.rows.forEach(row => {
                   const key = String(row[xCol] ?? "Unknown");
                   aggregated[key] = (aggregated[key] || 0) + (Number(row[yCol]) || 0);
                 });
                 chartData = Object.entries(aggregated)
                   .map(([label, value]) => ({ [xCol]: label, [yCol]: value }))
                   .sort((a, b) => (b[yCol] as number) - (a[yCol] as number))
                   .slice(0, 15);
                 answer = `Here is a ${requestedType} chart showing ${yCol} by ${xCol} (top 15).`;
               } else {
                 // Same column: count occurrences
                 chartData = dataEngine.rows.slice(0, 100);
                 answer = `Here is a ${requestedType} chart showing the distribution of ${xCol}.`;
               }
             } else if (requestedType === "scatter" && numCols.length >= 2) {
               chartConfig.xField = numCols[0].name;
               chartConfig.yField = numCols[1].name;
               chartConfig.title = `${numCols[0].name} vs ${numCols[1].name}`;
               chartData = dataEngine.rows;
               answer = `Here is a scatter plot showing the relationship between ${numCols[0].name} and ${numCols[1].name}.`;
             } else {
               chartData = dataEngine.rows.slice(0, 50);
               answer = `Here is a ${requestedType.replace("_", " ")} chart of ${yCol}.`;
             }
          } else {
            // No numeric columns — try to build a pie chart by counting categories
            if ((requestedType === "pie" || requestedType === "donut") && catCols.length > 0) {
              const bestCol = catCols.find(c => c.uniqueCount && c.uniqueCount > 1 && c.uniqueCount <= 30) || catCols[0];
              chartConfig = {
                type: requestedType as any,
                title: `Distribution of ${bestCol.name}`,
                xField: bestCol.name,
                colorScheme: "categorical"
              };
              chartData = dataEngine.rows.slice(0, 200);
              answer = `Here is a ${requestedType} chart showing the distribution of ${bestCol.name}.`;
            } else {
              answer = `I need at least one numeric column to draw a chart.`;
            }
          }

        } else if (intent.type === "column_lookup") {
          const colNames = intent.target!.split(/ and |,| & /i).map(c => c.trim()).filter(Boolean);
          const cols = dataEngine.getColumns(colNames).filter(Boolean) as {name: string}[];
          if (cols.length > 0) {
            answer = `Here is the data for the requested columns: **${cols.map(c => c.name).join(", ")}**.`;
            const rows = dataEngine.rows.slice(0, 50).map(r => cols.map(c => r[c.name]));
            dataTable = { show: true, columns: cols.map(c => c.name), rows };
          } else {
            answer = `I couldn't find those columns. Available columns: ${dataEngine.columns.map(c => c.name).join(", ")}`;
          }
        } else if (intent.type === "row_lookup") {
          const term = intent.term || "";
          const rows = dataEngine.getRowsByIdentifier(term);
          if (rows && rows.length > 0) {
            answer = `Here are the details for **${term}** (found in ${rows.length} row(s)):`;
            const cols = Object.keys(rows[0]);
            const vals = rows.slice(0, 50).map(row => cols.map(c => row[c]));
            dataTable = { show: true, columns: cols, rows: vals };
          } else {
            answer = `I couldn't find any row matching "${term}".`;
          }
        } else if (intent.type === "random_row") {
          const randIdx = Math.floor(Math.random() * dataEngine.rows.length);
          const row = dataEngine.rows[randIdx];
          answer = `Here is a randomly selected row (Row ${randIdx + 1}):`;
          const cols = Object.keys(row);
          const vals = cols.map(c => row[c]);
          dataTable = { show: true, columns: cols, rows: [vals] };
        } else if (intent.type === "random_column") {
          const randIdx = Math.floor(Math.random() * dataEngine.columns.length);
          const col = dataEngine.columns[randIdx];
          answer = `Here is a randomly selected column (**${col.name}**):`;
          const rows = dataEngine.rows.slice(0, 50).map(r => [r[col.name]]);
          dataTable = { show: true, columns: [col.name], rows };
        } else {
          answer = `I processed your request instantly: ${intent.type}`;
        }
      } catch (e: any) {
        answer = `Error processing request locally: ${e.message}`;
      }

      const msgContent: any = {
        id: assistantId,
        role: "assistant",
        content: answer,
        answer: answer,
        isStreaming: false,
        provider: "instant",
        followUps: followUps.length ? followUps : undefined
      };

      if (chartConfig && chartData.length > 0) {
        msgContent.chartConfig = chartConfig;
        msgContent.chartData = chartData;
      }
      if (dataTable) {
        msgContent.dataTable = dataTable;
      }

      addMessage(datasetId, msgContent);
      
      // Optionally fire a background request for a quick AI summary (omitted for brevity, instant is enough)
      return;
    }

    // AI REASONING FALLBACK
    setIsLoading(true);
    const assistantId = generateId();
    addMessage(datasetId, createMessage("assistant", "Thinking…", { id: assistantId, isStreaming: true }));

    try {
      // Build context from DataEngine
      const datasetContext = JSON.stringify(dataEngine.getMetadata());
      const history = chatMessages.slice(-6).map((m) => `${m.role}: ${m.content}`);

      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, datasetContext, detectedType: intent.type, history }),
      });

      if (!res.ok) throw new Error("API failed");
      const parsed = await res.json();
      
      let chartConfig: ChartConfig | undefined;
      let chartData: any[] = [];
      if (parsed.visualization && parsed.visualization.type !== "none") {
         chartConfig = {
           type: parsed.visualization.type === "bar" || parsed.visualization.type === "horizontal_bar" ? parsed.visualization.type : "bar",
           title: parsed.visualization.title || "AI Chart",
           xField: parsed.visualization.xAxis || dataEngine.getIdColumn(),
           yField: parsed.visualization.yAxis,
           colorScheme: "categorical"
         };
         chartData = parsed.visualization.data || [];
      }

      updateMessage(datasetId, assistantId, {
        content: parsed.answer || parsed.explanation || "Analyzed.",
        isStreaming: false,
        provider: "ai",
        answer: parsed.answer,
        explanation: parsed.explanation,
        chartConfig,
        chartData,
        followUps: parsed.followUps
      });
    } catch (err) {
      updateMessage(datasetId, assistantId, {
        content: "Sorry, the AI request failed. Please try a simpler query.",
        isStreaming: false,
        provider: "ai",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      <div className="flex-1 overflow-y-auto py-4 px-1 space-y-6">
        {chatMessages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2 gradient-text">
              {dataset ? `Analyzing ${dataset.name}` : "AI Data Assistant"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              {dataset
                ? `Your dataset has ${dataset.schema.rowCount.toLocaleString()} rows and ${dataset.schema.colCount} columns. Ask me anything!`
                : "Upload a dataset to start analyzing, or ask me a general question."}
            </p>
            {dataset && (
              <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
                {suggestedPrompts.map((p) => (
                  <button key={p} onClick={() => sendMessage(p)}
                    className="text-xs text-left p-3 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
                    {p}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {chatMessages.map((msg: any) => (
            <MessageBubble key={msg.id} message={msg} onFollowUpClick={sendMessage} />
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="chat-bubble-ai">
              <div className="flex gap-1.5 items-center py-1">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/50 pt-4">
        <div className="flex gap-3 items-end glass rounded-2xl p-3 shadow-sm border border-border/40 focus-within:border-primary/50 transition-colors">
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={dataset ? `Ask about ${dataset.name}…` : "Ask anything…"}
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm placeholder:text-muted-foreground focus:outline-none min-h-[36px] max-h-32 py-1.5"
            style={{ fieldSizing: "content" } as React.CSSProperties}
            disabled={isLoading}
          />
          <button
            id="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200 flex-shrink-0",
              input.trim() && !isLoading
                ? "btn-primary !px-3 !py-2.5 shadow-md shadow-primary/20"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onFollowUpClick }: { message: any; onFollowUpClick: (text: string) => void }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-3 flex-row-reverse animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-gradient-to-tr from-primary to-accent text-white">
          <User className="w-4 h-4" />
        </div>
        <div className="chat-bubble-user max-w-[85%]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-3 animate-in fade-in slide-in-from-bottom-2 duration-250">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-gradient-to-tr from-secondary to-secondary-foreground/10">
        <Bot className="w-4 h-4 text-primary" />
      </div>

      <div className="max-w-[85%] space-y-3 w-full">
        <div className="chat-bubble-ai max-w-full">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.explanation || message.content}</p>
          
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-end">
            {message.provider === "instant" ? (
              <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                <Zap className="w-3 h-3" /> Instant
              </span>
            ) : message.provider === "ai" ? (
              <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-[#7F77DD] bg-[#7F77DD]/10 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" /> AI Analysis
              </span>
            ) : null}
          </div>
        </div>

        {message.answer && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#1E1B4B] border-l-[3px] border-[#534AB7] p-4 rounded-xl text-foreground font-semibold text-sm leading-relaxed shadow-sm">
            {message.answer}
          </motion.div>
        )}

        {message.chartConfig && message.chartData && message.chartData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <ChartRenderer config={message.chartConfig} data={message.chartData} />
          </motion.div>
        )}

        {message.dataTable && message.dataTable.show && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="overflow-auto max-h-80 rounded-xl border border-border/50">
              <table className="w-full data-table text-sm">
                <thead className="sticky top-0 z-10 bg-[#141423] shadow-sm">
                  <tr>{message.dataTable.columns.map((c: string) => <th key={c} className="p-2 text-left font-semibold text-foreground border-b border-border/50">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {message.dataTable.rows.map((row: any[], i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-white/[0.02]">
                      {row.map((val: any, j: number) => (
                        <td key={j} className="p-2 text-muted-foreground whitespace-nowrap">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {message.followUps && message.followUps.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col gap-2 w-full pt-1">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 ml-1 select-none">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              Suggested Questions
            </span>
            <div className="flex flex-wrap gap-2">
              {message.followUps.map((q: string, i: number) => (
                <button key={i} onClick={() => onFollowUpClick(q)} className="text-xs bg-secondary/50 hover:bg-primary/10 hover:text-primary text-muted-foreground border border-[#2A2A4A] hover:border-primary/30 px-3 py-1.5 rounded-full transition-all text-left">
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
