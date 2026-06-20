import type { Dataset, AnomalyPoint, Insight, Prediction, InsightPriority } from "@/types";
import { generateId } from "@/lib/utils";

// ── Anomaly Detection (Z-Score) ────────────────────────────────────────────────
export function detectAnomalies(dataset: Dataset, zThreshold = 2.5): AnomalyPoint[] {
  const anomalies: AnomalyPoint[] = [];
  const numericCols = dataset.schema.columns.filter((c) => c.type === "number");

  numericCols.forEach((col) => {
    const values = dataset.rows.map((r) => Number(r[col.name])).filter((n) => !isNaN(n));
    if (values.length < 5) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (std === 0) return;

    dataset.rows.forEach((row, i) => {
      const v = Number(row[col.name]);
      if (isNaN(v)) return;
      const z = Math.abs((v - mean) / std);
      if (z > zThreshold) {
        const direction = v > mean ? "above" : "below";
        const explanation = `Value ${v.toLocaleString()} is ${z.toFixed(1)} standard deviations ${direction} the mean of ${mean.toFixed(2)}`;
        const causes: string[] = [];
        if (z > 4) causes.push("Possible data entry error");
        if (v === 0 && mean > 100) causes.push("May represent missing/null data entered as zero");
        if (v < 0 && mean > 0) causes.push("Unexpected negative value in positive-dominant column");
        causes.push("Natural statistical outlier");

        anomalies.push({
          index: i,
          column: col.name,
          value: v,
          zScore: +z.toFixed(2),
          label: `Row ${i + 1}: ${col.name} = ${v.toLocaleString()} (z=${z.toFixed(1)})`,
          explanation,
          possibleCauses: causes,
          suggestedAction: z > 4
            ? "Investigate and verify this data point"
            : "Consider capping or removing for sensitive analyses",
        });
      }
    });
  });

  // Limit to top-20 most extreme
  return anomalies.sort((a, b) => b.zScore - a.zScore).slice(0, 20);
}

// ── Priority mapping ─────────────────────────────────────────────────────────
function getPriority(type: Insight["type"], severity: Insight["severity"]): InsightPriority {
  if (severity === "high" && (type === "anomaly" || type === "trend")) return "critical";
  if (severity === "high") return "warning";
  if (type === "recommendation" || type === "prediction") return "opportunity";
  return "informational";
}

// ── Rule-based Insights (Enhanced) ──────────────────────────────────────────
export function generateRuleInsights(dataset: Dataset): Insight[] {
  const insights: Insight[] = [];
  const { columns, rowCount, missingPercent, duplicateCount, qualityScore } = dataset.schema;
  const numericCols = columns.filter((c) => c.type === "number");
  const catCols = columns.filter((c) => c.type === "string" && c.uniqueCount <= 30);

  // Quality score insight
  insights.push({
    id: generateId(),
    title: "Data Quality Score",
    description: `Your dataset scores ${qualityScore}/100 for data quality. ${qualityScore >= 80 ? "Great shape — ready for analysis!" : qualityScore >= 60 ? "Some cleaning recommended for optimal results." : "Significant cleaning needed before reliable analysis."}`,
    type: "info",
    severity: qualityScore >= 80 ? "info" : qualityScore >= 60 ? "medium" : "high",
    priority: qualityScore < 60 ? "critical" : "informational",
    value: `${qualityScore}/100`,
    actionable: qualityScore < 80,
    suggestedAction: qualityScore < 80 ? "Run Smart Data Cleaner" : undefined,
  });

  // Missing data
  if (missingPercent > 5) {
    insights.push({
      id: generateId(),
      title: "Missing Data Detected",
      description: `${missingPercent.toFixed(1)}% of values are missing across the dataset. Consider using the "Clean Dataset" feature to fill them automatically.`,
      type: "anomaly",
      severity: missingPercent > 20 ? "high" : "medium",
      priority: missingPercent > 20 ? "critical" : "warning",
      value: `${missingPercent.toFixed(1)}%`,
      actionable: true,
      suggestedAction: "Clean missing values using Smart Cleaner",
    });

    // Identify most affected columns
    const highMissing = columns.filter((c) => c.nullPercent > 10);
    if (highMissing.length > 0) {
      insights.push({
        id: generateId(),
        title: "Missing Values Concentrated",
        description: `Columns with highest missing rates: ${highMissing.slice(0, 3).map((c) => `${c.name} (${c.nullPercent.toFixed(1)}%)`).join(", ")}.`,
        type: "pattern",
        severity: "medium",
        priority: "warning",
        column: highMissing[0].name,
      });
    }
  }

  // Duplicates
  if (duplicateCount > 0) {
    insights.push({
      id: generateId(),
      title: "Duplicate Rows Found",
      description: `${duplicateCount} duplicate rows were detected (${((duplicateCount / rowCount) * 100).toFixed(1)}% of data). These may skew your analysis.`,
      type: "anomaly",
      severity: duplicateCount > rowCount * 0.05 ? "high" : "low",
      priority: duplicateCount > rowCount * 0.05 ? "warning" : "informational",
      value: `${duplicateCount} rows`,
      actionable: true,
      suggestedAction: "Remove duplicates via Smart Cleaner",
    });
  }

  // Numeric column insights
  numericCols.forEach((col) => {
    if (typeof col.mean === "number" && typeof col.std === "number" && col.std > 0) {
      const cv = (col.std / Math.abs(col.mean || 1)) * 100;

      // High variability
      if (cv > 80) {
        insights.push({
          id: generateId(),
          title: `High Variability: ${col.name}`,
          description: `${col.name} has a coefficient of variation of ${cv.toFixed(0)}%, indicating extreme spread. Range: ${col.min} – ${col.max}.`,
          type: "pattern",
          severity: cv > 150 ? "high" : "medium",
          priority: "warning",
          value: `CV: ${cv.toFixed(0)}%`,
          column: col.name,
        });
      }

      // Distribution insight
      if (typeof col.min === "number" && typeof col.max === "number") {
        const range = col.max - col.min;
        const spread = range / (col.mean || 1);
        if (spread > 10) {
          insights.push({
            id: generateId(),
            title: `Wide Range: ${col.name}`,
            description: `${col.name} spans from ${Number(col.min).toLocaleString()} to ${Number(col.max).toLocaleString()}, a ${spread.toFixed(0)}x spread relative to the mean.`,
            type: "distribution",
            severity: "low",
            priority: "informational",
            column: col.name,
          });
        }
      }
    }
  });

  // Categorical dominance
  catCols.forEach((col) => {
    if (col.uniqueCount === 1) {
      insights.push({
        id: generateId(),
        title: `Single Value: ${col.name}`,
        description: `Column ${col.name} has only one unique value. It provides no analytical value and could be removed.`,
        type: "info",
        severity: "low",
        priority: "informational",
        column: col.name,
        actionable: true,
        suggestedAction: "Consider removing this constant column",
      });
    }
  });

  // Correlation insights
  const intel = dataset.schema.intelligence;
  if (intel && intel.correlations.length > 0) {
    const strong = intel.correlations.filter((c) => c.strength === "strong");
    strong.slice(0, 2).forEach((corr) => {
      insights.push({
        id: generateId(),
        title: `Strong Correlation Detected`,
        description: `${corr.col1} and ${corr.col2} show a ${corr.correlation > 0 ? "positive" : "negative"} correlation of ${corr.correlation.toFixed(2)}. This relationship may indicate a causal or confounding factor.`,
        type: "correlation",
        severity: "medium",
        priority: "opportunity",
        value: `r = ${corr.correlation.toFixed(2)}`,
        actionable: true,
        suggestedAction: "Create a scatter plot to investigate further",
      });
    });
  }

  // Dataset size
  if (rowCount > 100000) {
    insights.push({
      id: generateId(),
      title: "Large Dataset",
      description: `With ${rowCount.toLocaleString()} rows, this is a substantial dataset. Queries may take slightly longer, but analysis will be comprehensive.`,
      type: "info",
      severity: "info",
      priority: "informational",
      value: `${rowCount.toLocaleString()} rows`,
    });
  }

  // Recommendation insights
  if (numericCols.length >= 2) {
    insights.push({
      id: generateId(),
      title: "Explore Numeric Relationships",
      description: `With ${numericCols.length} numeric columns, scatter plots can reveal hidden patterns between variables like ${numericCols.slice(0, 2).map((c) => c.name).join(" and ")}.`,
      type: "recommendation",
      severity: "info",
      priority: "opportunity",
      actionable: true,
      suggestedAction: "Ask the chat to create scatter plots",
    });
  }

  // Sort by priority
  const priorityOrder: Record<InsightPriority, number> = { critical: 4, warning: 3, opportunity: 2, informational: 1 };
  insights.sort((a, b) => priorityOrder[a.priority ?? "informational"] - priorityOrder[b.priority ?? "informational"]);
  insights.reverse();

  return insights;
}

// ── Simple Linear Trend Forecast ──────────────────────────────────────────────
export function forecastTrend(dataset: Dataset, column: string, periods = 6): Prediction | null {
  const col = dataset.schema.columns.find((c) => c.name === column && c.type === "number");
  if (!col) return null;

  const values = dataset.rows
    .map((r, i) => ({ x: i, y: Number(r[column]) }))
    .filter((p) => !isNaN(p.y));
  if (values.length < 5) return null;

  const n = values.length;
  const sumX = values.reduce((a, p) => a + p.x, 0);
  const sumY = values.reduce((a, p) => a + p.y, 0);
  const sumXY = values.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = values.reduce((a, p) => a + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const std = Math.sqrt(
    values.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0) / n
  );

  // Determine trend direction
  const avgFirst = values.slice(0, Math.floor(n / 3)).reduce((a, p) => a + p.y, 0) / Math.floor(n / 3);
  const avgLast = values.slice(-Math.floor(n / 3)).reduce((a, p) => a + p.y, 0) / Math.floor(n / 3);
  const growthRate = avgFirst !== 0 ? ((avgLast - avgFirst) / Math.abs(avgFirst)) * 100 : 0;

  let trend: Prediction["trend"];
  if (Math.abs(growthRate) < 5) trend = "stable";
  else if (std / (col.mean || 1) > 0.5) trend = "volatile";
  else trend = growthRate > 0 ? "increasing" : "decreasing";

  const predictionValues = [
    ...values.slice(-10).map((p) => ({
      period: `Point ${p.x + 1}`,
      actual: +p.y.toFixed(2),
      predicted: +(slope * p.x + intercept).toFixed(2),
      lower: +(slope * p.x + intercept - 1.96 * std).toFixed(2),
      upper: +(slope * p.x + intercept + 1.96 * std).toFixed(2),
    })),
    ...Array.from({ length: periods }, (_, i) => {
      const x = n + i;
      const pred = slope * x + intercept;
      return {
        period: `Forecast ${i + 1}`,
        predicted: +pred.toFixed(2),
        lower: +(pred - 1.96 * std).toFixed(2),
        upper: +(pred + 1.96 * std).toFixed(2),
      };
    }),
  ];

  return {
    column,
    values: predictionValues,
    confidence: 0.95,
    method: "Linear Regression",
    trend,
    growthRate: +growthRate.toFixed(2),
  };
}
