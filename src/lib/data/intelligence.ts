import type { Dataset, DatasetIntelligence, DatasetTag, CorrelationPair, AIRecommendation } from "@/types";
import { generateId } from "@/lib/utils";

// ── Tag Detection Keywords ──────────────────────────────────────────────────
const TAG_KEYWORDS: Record<DatasetTag, string[]> = {
  sales: ["sale", "sales", "revenue", "profit", "order", "customer", "transaction", "invoice", "price", "discount", "quantity"],
  healthcare: ["patient", "diagnosis", "hospital", "medical", "health", "treatment", "symptom", "drug", "medicine", "doctor"],
  student: ["student", "grade", "score", "exam", "course", "gpa", "school", "university", "class", "enrollment"],
  ecommerce: ["product", "cart", "checkout", "shipping", "sku", "catalog", "wishlist", "review", "rating"],
  finance: ["stock", "portfolio", "interest", "loan", "credit", "debit", "balance", "account", "banking", "investment"],
  marketing: ["campaign", "click", "impression", "conversion", "channel", "ctr", "bounce", "engagement", "ad", "lead"],
  hr: ["employee", "salary", "department", "hire", "position", "leave", "attendance", "performance", "benefit"],
  logistics: ["shipment", "warehouse", "delivery", "tracking", "freight", "route", "cargo", "inventory"],
  social_media: ["follower", "like", "comment", "share", "post", "tweet", "hashtag", "engagement", "reach"],
  iot: ["sensor", "temperature", "humidity", "device", "reading", "measurement", "signal", "voltage"],
  survey: ["response", "question", "answer", "satisfaction", "feedback", "opinion", "likert", "survey"],
  weather: ["temperature", "precipitation", "wind", "humidity", "pressure", "forecast", "weather", "climate"],
  sports: ["player", "team", "score", "match", "goal", "assist", "season", "tournament", "win", "loss"],
  general: [],
};

// ── Detect dataset tags ──────────────────────────────────────────────────────
export function detectDatasetTags(dataset: Dataset): DatasetTag[] {
  const allText = [
    ...dataset.schema.columns.map((c) => c.name.toLowerCase()),
    ...dataset.rows.slice(0, 10).flatMap((r) => Object.values(r).map((v) => String(v).toLowerCase())),
  ].join(" ");

  const scores: { tag: DatasetTag; score: number }[] = [];

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (tag === "general") continue;
    const score = keywords.reduce((acc, kw) => acc + (allText.includes(kw) ? 1 : 0), 0);
    if (score >= 2) scores.push({ tag: tag as DatasetTag, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const result = scores.slice(0, 3).map((s) => s.tag);
  return result.length ? result : ["general"];
}

// ── Pearson correlation ──────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const num = xs.slice(0, n).reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.slice(0, n).reduce((a, v) => a + (v - mx) ** 2, 0));
  const dy = Math.sqrt(ys.slice(0, n).reduce((a, v) => a + (v - my) ** 2, 0));
  return dx * dy === 0 ? 0 : +(num / (dx * dy)).toFixed(4);
}

function getStrength(r: number): CorrelationPair["strength"] {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "strong";
  if (abs >= 0.4) return "moderate";
  if (abs >= 0.2) return "weak";
  return "none";
}

// ── Detect correlations ──────────────────────────────────────────────────────
export function detectCorrelations(dataset: Dataset): CorrelationPair[] {
  const numCols = dataset.schema.columns.filter((c) => c.type === "number");
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < numCols.length; i++) {
    for (let j = i + 1; j < numCols.length; j++) {
      const xs = dataset.rows.map((r) => Number(r[numCols[i].name])).filter((n) => !isNaN(n));
      const ys = dataset.rows.map((r) => Number(r[numCols[j].name])).filter((n) => !isNaN(n));
      const r = pearson(xs, ys);
      pairs.push({
        col1: numCols[i].name,
        col2: numCols[j].name,
        correlation: r,
        strength: getStrength(r),
      });
    }
  }

  return pairs.filter((p) => p.strength !== "none").sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

// ── Build full intelligence ──────────────────────────────────────────────────
export function buildDatasetIntelligence(dataset: Dataset): DatasetIntelligence {
  const { columns } = dataset.schema;

  const tags = detectDatasetTags(dataset);
  const correlations = detectCorrelations(dataset);
  const timeColumns = columns.filter((c) => c.type === "date").map((c) => c.name);
  const numericCols = columns.filter((c) => c.type === "number").map((c) => c.name);
  const categoricalCols = columns.filter((c) => c.type === "string" && c.uniqueCount <= 50).map((c) => c.name);
  const highCardinalityCols = columns.filter((c) => c.type === "string" && c.uniqueCount > 50).map((c) => c.name);

  // Detect hierarchical columns (columns where unique count is nested)
  const hierarchicalCols: string[] = [];
  const stringCols = columns.filter((c) => c.type === "string");
  for (let i = 0; i < stringCols.length; i++) {
    for (let j = i + 1; j < stringCols.length; j++) {
      if (stringCols[i].uniqueCount < stringCols[j].uniqueCount * 0.3) {
        hierarchicalCols.push(stringCols[i].name);
        break;
      }
    }
  }

  const nullHeatmap = columns
    .filter((c) => c.nullPercent > 0)
    .map((c) => ({ column: c.name, percent: c.nullPercent }))
    .sort((a, b) => b.percent - a.percent);

  const estimatedCategory = tags[0] === "general"
    ? `General dataset with ${numericCols.length} numeric and ${categoricalCols.length} categorical columns`
    : `${tags[0].charAt(0).toUpperCase() + tags[0].slice(1)} dataset`;

  return {
    tags,
    correlations,
    timeColumns,
    hierarchicalCols,
    categoricalCols,
    numericCols,
    highCardinalityCols,
    nullHeatmap,
    datasetSizeBytes: dataset.size ?? 0,
    estimatedCategory,
  };
}

// ── Generate AI Recommendations ──────────────────────────────────────────────
export function generateRecommendations(dataset: Dataset): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const { schema } = dataset;
  const intel = schema.intelligence;

  // Cleaning recommendations
  if (schema.missingPercent > 5) {
    recs.push({
      id: generateId(),
      type: "cleaning",
      title: "Clean Missing Values",
      description: `${schema.missingPercent.toFixed(1)}% of your data has missing values. Cleaning can improve analysis accuracy.`,
      priority: schema.missingPercent > 20 ? "high" : "medium",
      actionLabel: "Clean Now",
      actionRoute: "/clean",
    });
  }

  if (schema.duplicateCount > 0) {
    recs.push({
      id: generateId(),
      type: "cleaning",
      title: "Remove Duplicates",
      description: `Found ${schema.duplicateCount} duplicate rows that may skew your analysis.`,
      priority: schema.duplicateCount > schema.rowCount * 0.05 ? "high" : "low",
      actionLabel: "Clean Dataset",
      actionRoute: "/clean",
    });
  }

  // Chart recommendations
  if (intel) {
    if (intel.timeColumns.length > 0 && intel.numericCols.length > 0) {
      recs.push({
        id: generateId(),
        type: "chart",
        title: "Explore Time Trends",
        description: `Your dataset has time-series data. Visualize ${intel.numericCols[0]} trends over time.`,
        priority: "high",
        actionLabel: "View Trends",
        actionRoute: "/chat",
      });
    }

    if (intel.correlations.filter((c) => c.strength === "strong").length > 0) {
      const strong = intel.correlations.find((c) => c.strength === "strong")!;
      recs.push({
        id: generateId(),
        type: "analysis",
        title: "Strong Correlation Found",
        description: `${strong.col1} and ${strong.col2} have a ${strong.correlation > 0 ? "positive" : "negative"} correlation of ${strong.correlation.toFixed(2)}.`,
        priority: "high",
        actionLabel: "Investigate",
        actionRoute: "/insights",
      });
    }

    if (intel.categoricalCols.length > 0 && intel.numericCols.length > 0) {
      recs.push({
        id: generateId(),
        type: "chart",
        title: "Compare Categories",
        description: `Analyze how ${intel.numericCols[0]} varies across ${intel.categoricalCols[0]} categories.`,
        priority: "medium",
        actionLabel: "Create Chart",
        actionRoute: "/chat",
      });
    }
  }

  // Prediction recommendation
  const numCols = schema.columns.filter((c) => c.type === "number");
  if (numCols.length > 0 && schema.rowCount > 10) {
    recs.push({
      id: generateId(),
      type: "prediction",
      title: "Run Predictive Analysis",
      description: `With ${schema.rowCount} data points, you can generate trend forecasts for ${numCols[0].name}.`,
      priority: "medium",
      actionLabel: "Predict Trends",
      actionRoute: "/insights",
    });
  }

  // Anomaly recommendation
  recs.push({
    id: generateId(),
    type: "anomaly",
    title: "Detect Anomalies",
    description: "Scan your dataset for unusual patterns, outliers, and suspicious values.",
    priority: "medium",
    actionLabel: "Scan Now",
    actionRoute: "/insights",
  });

  return recs.sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority];
  });
}
