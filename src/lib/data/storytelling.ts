import type { Dataset, DataStory, StoryStep } from "@/types";
import { generateId } from "@/lib/utils";

/**
 * Generate a data narrative from dataset statistics.
 * This is a rule-based storytelling engine that creates a step-by-step narrative.
 */
export function generateDataStory(dataset: Dataset): DataStory {
  const { schema, name } = dataset;
  const steps: StoryStep[] = [];
  const recommendations: string[] = [];
  const intel = schema.intelligence;
  const numCols = schema.columns.filter((c) => c.type === "number");
  const catCols = schema.columns.filter((c) => c.type === "string" && c.uniqueCount <= 30);
  const timeCols = schema.columns.filter((c) => c.type === "date");

  // Step 1: Overview
  steps.push({
    id: generateId(),
    title: "Dataset Overview",
    narrative: `This dataset "${name}" contains **${schema.rowCount.toLocaleString()} records** across **${schema.colCount} fields**. ${
      numCols.length > 0
        ? `There are ${numCols.length} numeric columns suitable for quantitative analysis`
        : "The data is primarily categorical"
    }${catCols.length > 0 ? ` and ${catCols.length} categorical columns for segmentation.` : "."}${
      schema.qualityScore >= 80
        ? " The data quality is excellent."
        : schema.qualityScore >= 60
        ? " The data quality is fair with some cleaning recommended."
        : " The data quality needs improvement before deep analysis."
    }`,
    icon: "📊",
  });

  // Step 2: Data Quality
  if (schema.missingPercent > 0 || schema.duplicateCount > 0) {
    const issues: string[] = [];
    if (schema.missingPercent > 0)
      issues.push(`${schema.missingPercent.toFixed(1)}% missing values`);
    if (schema.duplicateCount > 0)
      issues.push(`${schema.duplicateCount} duplicate rows`);

    steps.push({
      id: generateId(),
      title: "Data Quality Assessment",
      narrative: `The dataset has ${issues.join(" and ")}. ${
        schema.qualityScore >= 80
          ? "Overall, the data is in good shape for analysis."
          : "Consider running the Smart Cleaner to improve data quality before analysis."
      } Quality Score: **${schema.qualityScore}/100**.`,
      icon: "🔍",
    });

    if (schema.qualityScore < 80) {
      recommendations.push("Run the Smart Data Cleaner to handle missing values and duplicates");
    }
  }

  // Step 3: Key Numeric Insights
  if (numCols.length > 0) {
    const topCol = numCols[0];
    const values = dataset.rows.map((r) => Number(r[topCol.name])).filter((n) => !isNaN(n));
    if (values.length > 0) {
      const total = values.reduce((a, b) => a + b, 0);
      const avg = total / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      steps.push({
        id: generateId(),
        title: `Key Metric: ${topCol.name}`,
        narrative: `The primary numeric column **${topCol.name}** ranges from **${min.toLocaleString(undefined, { maximumFractionDigits: 2 })}** to **${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}** with an average of **${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}**. ${
          typeof topCol.std === "number" && topCol.std > avg * 0.5
            ? "High variability detected — the values are widely spread."
            : "The distribution is relatively concentrated around the mean."
        }`,
        icon: "📈",
        chartData: dataset.rows.slice(0, 50).map((r, i) => ({
          index: i + 1,
          [topCol.name]: Number(r[topCol.name]) || 0,
        })),
        chartType: "area",
        chartConfig: { x: "index", y: topCol.name },
      });
    }
  }

  // Step 4: Category Distribution
  if (catCols.length > 0) {
    const topCat = catCols[0];
    const counts = new Map<string, number>();
    dataset.rows.forEach((r) => {
      const v = String(r[topCat.name] ?? "");
      counts.set(v, (counts.get(v) ?? 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const topVal = sorted[0];
    const dominance = topVal ? ((topVal[1] / dataset.rows.length) * 100).toFixed(1) : "0";

    steps.push({
      id: generateId(),
      title: `Distribution: ${topCat.name}`,
      narrative: `Among ${topCat.uniqueCount} categories in **${topCat.name}**, "${topVal?.[0]}" is the most frequent with **${dominance}%** of records.${
        sorted.length > 1
          ? ` Followed by "${sorted[1][0]}" (${((sorted[1][1] / dataset.rows.length) * 100).toFixed(1)}%).`
          : ""
      }`,
      icon: "🎯",
      chartData: sorted.slice(0, 8).map(([name, count]) => ({ [topCat.name]: name, count })),
      chartType: "pie",
      chartConfig: { x: topCat.name, y: "count" },
    });
  }

  // Step 5: Correlations
  if (intel && intel.correlations.length > 0) {
    const strongCorrs = intel.correlations.filter((c) => c.strength === "strong" || c.strength === "moderate");
    if (strongCorrs.length > 0) {
      const top = strongCorrs[0];
      steps.push({
        id: generateId(),
        title: "Relationship Discovery",
        narrative: `A **${top.strength} ${top.correlation > 0 ? "positive" : "negative"} correlation** (r=${top.correlation.toFixed(2)}) was found between **${top.col1}** and **${top.col2}**. ${
          top.correlation > 0
            ? "As one increases, the other tends to increase as well."
            : "As one increases, the other tends to decrease."
        }${strongCorrs.length > 1 ? ` ${strongCorrs.length - 1} more significant correlations were detected.` : ""}`,
        icon: "🔗",
        chartData: dataset.rows.slice(0, 100).map((r) => ({
          [top.col1]: Number(r[top.col1]) || 0,
          [top.col2]: Number(r[top.col2]) || 0,
        })),
        chartType: "scatter",
        chartConfig: { x: top.col1, y: top.col2 },
      });

      recommendations.push(`Investigate the relationship between ${top.col1} and ${top.col2}`);
    }
  }

  // Step 6: Time Trends
  if (timeCols.length > 0 && numCols.length > 0) {
    steps.push({
      id: generateId(),
      title: "Time-Based Patterns",
      narrative: `The dataset contains temporal data in **${timeCols[0].name}**. This enables trend analysis, seasonality detection, and time-series forecasting for metrics like **${numCols[0].name}**.`,
      icon: "⏰",
    });

    recommendations.push(`Create time-series charts to visualize ${numCols[0].name} trends over ${timeCols[0].name}`);
  }

  // Step 7: Recommendations
  if (intel && intel.tags[0] !== "general") {
    const tagLabels = intel.tags.map((t) => t.charAt(0).toUpperCase() + t.slice(1));
    steps.push({
      id: generateId(),
      title: "Dataset Classification",
      narrative: `This appears to be a **${tagLabels.join(" / ")} dataset**. Based on this classification, specialized analysis patterns can be applied for deeper insights.`,
      icon: "🏷️",
    });
  }

  // Generate additional recommendations
  if (numCols.length >= 2) {
    recommendations.push("Generate scatter plots to explore relationships between numeric variables");
  }
  if (catCols.length > 0 && numCols.length > 0) {
    recommendations.push(`Compare ${numCols[0].name} across different ${catCols[0].name} categories`);
  }
  recommendations.push("Generate a comprehensive PDF report for stakeholders");

  // Build summary
  const summary = `"${name}" is a ${schema.rowCount.toLocaleString()}-row dataset with ${schema.colCount} columns. ${
    intel
      ? `Detected as a ${intel.estimatedCategory.toLowerCase()}.`
      : ""
  } ${
    schema.qualityScore >= 80
      ? "Data quality is excellent."
      : "Some data quality improvements are recommended."
  }`;

  return {
    id: generateId(),
    title: `Data Story: ${name}`,
    summary,
    steps,
    recommendations,
    generatedAt: new Date().toISOString(),
    datasetName: name,
  };
}
