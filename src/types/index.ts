// ─── Dataset & Schema ────────────────────────────────────────────────────────

export type ColumnType = "string" | "number" | "date" | "boolean" | "unknown";

export interface ColumnMeta {
  name: string;
  type: ColumnType;
  nullCount: number;
  nullPercent: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  std?: number;
  sample: unknown[];
}

export type DatasetTag =
  | "sales" | "healthcare" | "student" | "ecommerce" | "finance"
  | "marketing" | "hr" | "logistics" | "social_media" | "iot"
  | "survey" | "weather" | "sports" | "general";

export interface CorrelationPair {
  col1: string;
  col2: string;
  correlation: number;
  strength: "strong" | "moderate" | "weak" | "none";
}

export interface DatasetIntelligence {
  tags: DatasetTag[];
  correlations: CorrelationPair[];
  timeColumns: string[];
  hierarchicalCols: string[];
  categoricalCols: string[];
  numericCols: string[];
  highCardinalityCols: string[];
  nullHeatmap: { column: string; percent: number }[];
  datasetSizeBytes: number;
  estimatedCategory: string;
}

export interface DatasetSchema {
  columns: ColumnMeta[];
  rowCount: number;
  colCount: number;
  duplicateCount: number;
  missingTotal: number;
  missingPercent: number;
  qualityScore: number;
  aiExplanation?: string;
  suggestions?: string[];
  intelligence?: DatasetIntelligence;
}

export interface Dataset {
  id: string;
  name: string;
  uploadedAt: string;
  rows: Record<string, unknown>[];
  schema: DatasetSchema;
  rawFile?: File;
  size?: number;
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  queryResult?: QueryResult;
  isStreaming?: boolean;
  provider?: string;
  error?: string;
  recommendations?: string[];
  followUpQueries?: string[];

  // Structured AI response fields
  answer?: string;
  explanation?: string;
  visualization?: {
    type: "bar" | "line" | "pie" | "horizontal_bar" | "none";
    title: string;
    xAxis: string;
    yAxis: string;
    xLabel?: string;
    yLabel?: string;
    data: { label: string; value: number }[];
    color?: string;
    limit?: number;
  };
  dataTable?: {
    show: boolean;
    columns: string[];
    rows: any[][];
    title?: string;
  };
  insights?: string[];
  followUps?: string[];
  actions?: { label: string; route: string }[];
  chartConfig?: any;
  chartData?: any[];
}

// ─── Query Engine ─────────────────────────────────────────────────────────────

export type AggregationType = "sum" | "mean" | "count" | "min" | "max" | "median";
export type ChartType = "bar" | "line" | "area" | "pie" | "donut" | "scatter" | "table" | "histogram" | "radar" | "heatmap" | "stacked_bar";
export type SortDirection = "asc" | "desc";
export type OperationType =
  | "groupby"
  | "timeseries"
  | "filter"
  | "sort"
  | "top_n"
  | "correlation"
  | "describe"
  | "raw"
  | "aggregate"
  | "histogram"
  | "anomaly_detect";

export interface FilterClause {
  column: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains";
  value: unknown;
}

export interface QueryPlan {
  operation: OperationType;
  title?: string;
  groupBy?: string[];
  timeColumn?: string;
  metric?: string;
  agg?: AggregationType;
  filters?: FilterClause[];
  sort?: { column: string; direction: SortDirection };
  limit?: number;
  columns?: string[];
  explanation?: string;
  chart?: {
    type: ChartType;
    x?: string;
    y?: string | string[];
    colorBy?: string;
  };
}

export interface QueryResult {
  plan: QueryPlan;
  data: Record<string, unknown>[];
  explanation?: string;
  durationMs: number;
  rowCount: number;
  anomalyIndices?: number[];
}

// ─── Insights ────────────────────────────────────────────────────────────────

export type InsightPriority = "critical" | "warning" | "opportunity" | "informational";
export type InsightCategory = "trend" | "distribution" | "anomaly" | "correlation" | "recommendation";

export interface Insight {
  id: string;
  title: string;
  description: string;
  type: "trend" | "anomaly" | "pattern" | "prediction" | "info" | "distribution" | "correlation" | "recommendation";
  severity: "high" | "medium" | "low" | "info";
  priority?: InsightPriority;
  category?: InsightCategory;
  value?: string;
  change?: number;
  column?: string;
  chartData?: Record<string, unknown>[];
  chartType?: ChartType;
  actionable?: boolean;
  suggestedAction?: string;
}

export interface AnomalyPoint {
  index: number;
  column: string;
  value: number;
  zScore: number;
  label: string;
  explanation?: string;
  possibleCauses?: string[];
  suggestedAction?: string;
}

export interface Prediction {
  column: string;
  values: { period: string; actual?: number; predicted: number; lower: number; upper: number }[];
  confidence: number;
  method: string;
  trend?: "increasing" | "decreasing" | "stable" | "volatile";
  growthRate?: number;
}

// ─── Data Story ──────────────────────────────────────────────────────────────

export interface StoryStep {
  id: string;
  title: string;
  narrative: string;
  chartData?: Record<string, unknown>[];
  chartType?: ChartType;
  chartConfig?: { x?: string; y?: string };
  highlight?: string;
  icon?: string;
}

export interface DataStory {
  id: string;
  title: string;
  summary: string;
  steps: StoryStep[];
  recommendations: string[];
  generatedAt: string;
  datasetName: string;
}

// ─── AI Recommendations ─────────────────────────────────────────────────────

export interface AIRecommendation {
  id: string;
  type: "chart" | "anomaly" | "cleaning" | "prediction" | "analysis";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  actionLabel: string;
  actionRoute?: string;
  dismissed?: boolean;
}

// ─── Cleaning ────────────────────────────────────────────────────────────────

export interface CleaningPreviewItem {
  row: number;
  column: string;
  original: unknown;
  cleaned: unknown;
  reason: string;
}

export interface EnhancedCleaningReport {
  originalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  missingFilled: number;
  outliersHandled: number;
  typesFixed: number;
  typosCorrected: number;
  whitespaceNormalized: number;
  datesNormalized: number;
  changes: string[];
  confidenceScore: number;
  preview: CleaningPreviewItem[];
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  chartData?: Record<string, unknown>[];
  chartType?: ChartType;
  chartConfig?: { x?: string; y?: string };
  tableData?: Record<string, unknown>[];
}

export interface Report {
  id: string;
  title: string;
  datasetName: string;
  createdAt: string;
  sections: ReportSection[];
  insights: Insight[];
  story?: DataStory;
  executiveSummary?: string;
}

// ─── AI Response ──────────────────────────────────────────────────────────────

export interface AIResponse {
  content: string;
  queryPlan?: QueryPlan;
  provider: string;
  tokensUsed?: number;
  durationMs: number;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppSettings {
  theme: "dark" | "light";
  preferredProvider: "openai" | "groq" | "gemini" | "auto";
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}
