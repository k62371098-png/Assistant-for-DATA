import type { Dataset } from "@/types";

const ID_PATTERNS = /id|number|phone|mobile|code|zip/i;
const NAME_PATTERNS = /name|id|title/i;

export function pickMeanCol(cols: { name: string; type: string; mean?: number }[]) {
  return cols.find(c => c.type === "number" && !ID_PATTERNS.test(c.name)) || cols.find(c => c.type === "number");
}

export function pickUniqueCol(cols: { name: string; type: string; uniqueCount?: number }[]) {
  return cols.find(c => c.type === "string" && !NAME_PATTERNS.test(c.name)) || cols.find(c => c.type === "string");
}

export function countAnomalies(dataset: Dataset) {
  let count = 0;
  const cols = dataset.schema.columns;
  // Outliers
  cols.filter(c => c.type === "number" && typeof c.mean === "number" && typeof c.std === "number" && c.std > 0).forEach(c => {
    dataset.rows.forEach(r => {
      const v = Number(r[c.name]);
      if (!isNaN(v) && Math.abs((v - c.mean!) / c.std!) > 2.5) count++;
    });
  });
  // Suspicious placeholders
  const placeholders = ["n/a", "na", "null", "none", "-", "unknown", "test", "xxx", "0000"];
  cols.filter(c => c.type === "string").forEach(c => {
    dataset.rows.forEach(r => {
      const v = String(r[c.name] || "").toLowerCase().trim();
      if (placeholders.includes(v)) count++;
    });
  });
  return count;
}

export function computeQualityScore(dataset: Dataset): number {
  if (dataset.rows.length > 0 && "quality_score" in dataset.rows[0]) {
    const sum = dataset.rows.reduce((acc, r) => acc + Number(r["quality_score"] || 0), 0);
    return Math.round(sum / dataset.rows.length);
  }
  let nonNull = 0, total = 0;
  dataset.rows.forEach(r => {
    Object.values(r).forEach(v => { total++; if (v !== null && v !== undefined && v !== "") nonNull++; });
  });
  return total > 0 ? Math.round((nonNull / total) * 100) : 0;
}

export function levenshtein(a: string, b: string): number {
  if (!a) return b.length; if (!b) return a.length;
  const m: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = a[i-1] === b[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1]+1);
    }
  }
  return m[a.length][b.length];
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx, yi = y[i] - my;
    num += xi * yi; dx += xi * xi; dy += yi * yi;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

export function strengthLabel(v: number): "strong" | "moderate" | "weak" | "negligible" {
  const a = Math.abs(v);
  if (a >= 0.7) return "strong";
  if (a >= 0.4) return "moderate";
  if (a >= 0.2) return "weak";
  return "negligible";
}

export interface AnomalyItem {
  column: string;
  index: number;
  value: unknown;
  explanation: string;
  severity: "outlier" | "inconsistency" | "suspicious";
  zScore?: number;
}

export function detectAnomalies(dataset: Dataset): AnomalyItem[] {
  const results: AnomalyItem[] = [];
  const cols = dataset.schema.columns;

  // Statistical outliers
  cols.filter(c => c.type === "number" && typeof c.mean === "number" && typeof c.std === "number" && c.std > 0).forEach(c => {
    dataset.rows.forEach((r, i) => {
      const raw = r[c.name];
      if (raw === null || raw === undefined || raw === "") return;
      const v = Number(raw);
      if (!isNaN(v)) {
        const z = Math.abs((v - c.mean!) / c.std!);
        if (z > 2.5) results.push({ column: c.name, index: i, value: v, explanation: `${z.toFixed(1)}σ from mean`, severity: "outlier", zScore: z });
      }
    });
  });

  // Categorical inconsistencies
  cols.filter(c => c.type === "string" && c.uniqueCount > 1 && c.uniqueCount <= 30).forEach(c => {
    const counts = new Map<string, number>();
    dataset.rows.forEach(r => { const v = String(r[c.name] || ""); if (v) counts.set(v, (counts.get(v) || 0) + 1); });
    let mode = "", max = 0;
    counts.forEach((n, k) => { if (n > max) { mode = k; max = n; } });
    if (mode) {
      dataset.rows.forEach((r, i) => {
        const v = String(r[c.name] || "");
        if (v && v !== mode && levenshtein(v.toLowerCase(), mode.toLowerCase()) <= 2 && (counts.get(v) || 0) < 3) {
          results.push({ column: c.name, index: i, value: v, explanation: `Similar to: ${mode}`, severity: "inconsistency" });
        }
      });
    }
  });

  // Suspicious placeholders
  const placeholders = ["n/a", "na", "null", "none", "-", "unknown", "test", "xxx", "0000"];
  const repeatedDigits = /^(\d)\1{5,}$/;
  cols.forEach(c => {
    dataset.rows.forEach((r, i) => {
      const v = String(r[c.name] || "").trim();
      const vl = v.toLowerCase();
      if (placeholders.includes(vl)) {
        results.push({ column: c.name, index: i, value: v, explanation: "Suspicious placeholder value", severity: "suspicious" });
      } else if (repeatedDigits.test(v)) {
        results.push({ column: c.name, index: i, value: v, explanation: "Repeated digits pattern", severity: "suspicious" });
      } else if (c.type === "number" && Number(r[c.name]) === 0) {
        const colName = c.name.toLowerCase();
        if (colName.includes("age") || colName.includes("year") || colName.includes("salary") || colName.includes("price")) {
          results.push({ column: c.name, index: i, value: 0, explanation: `Zero in ${c.name} column seems implausible`, severity: "suspicious" });
        }
      }
    });
  });

  return results;
}

export function buildQuestionChips(dataset: Dataset): string[] {
  const cols = dataset.schema.columns;
  const numCols = cols.filter(c => c.type === "number" && !ID_PATTERNS.test(c.name));
  const catCols = cols.filter(c => c.type === "string" && !NAME_PATTERNS.test(c.name));
  const dateCol = cols.find(c => c.type === "date");
  
  const numCol = numCols[0]?.name || cols.find(c => c.type === "number")?.name || "value";
  const numCol2 = numCols[1]?.name || numCol;
  const catCol = catCols[0]?.name || cols.find(c => c.type === "string")?.name || "category";
  
  const chips = [
    `Average ${numCol} by ${catCol}`,
    `Which ${catCol} has the highest ${numCol}?`,
    `Show me the distribution of ${numCol}`,
    `How many unique values are in ${catCol}?`,
    `Which rows have the top 5 highest ${numCol}?`,
  ];
  
  if (dateCol) {
    chips.push(`Show ${numCol} trend over ${dateCol.name}`);
  } else {
    chips.push(`What is the correlation between ${numCol} and ${numCol2}?`);
  }
  
  return chips;
}
