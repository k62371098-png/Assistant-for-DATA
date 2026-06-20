import type { Dataset, EnhancedCleaningReport, CleaningPreviewItem } from "@/types";
import { processRows } from "./parser";

// Z-score based outlier detection
function isOutlier(value: number, mean: number, std: number, threshold = 3): boolean {
  if (std === 0) return false;
  return Math.abs((value - mean) / std) > threshold;
}

// Fuzzy string similarity (Levenshtein-based)
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  if (!al.length || !bl.length) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= al.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= bl.length; j++) {
      matrix[i][j] =
        i === 0
          ? j
          : Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + (al[i - 1] === bl[j - 1] ? 0 : 1)
            );
    }
  }
  const maxLen = Math.max(al.length, bl.length);
  return 1 - matrix[al.length][bl.length] / maxLen;
}

// Detect and fix common typos in categorical columns
function fixTypos(values: string[]): Map<string, string> {
  const corrections = new Map<string, string>();
  const counts = new Map<string, number>();

  values.forEach((v) => {
    const trimmed = v.trim();
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  });

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // For each rare value, check if it's similar to a common value
  for (const [rare, rareCount] of sorted) {
    if (rareCount > sorted[0][1] * 0.1) continue; // Not rare enough
    for (const [common, commonCount] of sorted) {
      if (common === rare) continue;
      if (commonCount <= rareCount) continue;
      const sim = similarity(rare, common);
      if (sim >= 0.8 && sim < 1) {
        corrections.set(rare, common);
        break;
      }
    }
  }

  return corrections;
}

// Normalize date formats
function normalizeDate(val: string): string | null {
  const patterns = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/, // YYYY-MM-DD
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,  // MM/DD/YY
  ];

  for (const pattern of patterns) {
    const match = val.match(pattern);
    if (match) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split("T")[0];
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function cleanDataset(dataset: Dataset): { cleaned: Dataset; report: EnhancedCleaningReport } {
  const report: EnhancedCleaningReport = {
    originalRows: dataset.rows.length,
    cleanedRows: 0,
    duplicatesRemoved: 0,
    missingFilled: 0,
    outliersHandled: 0,
    typesFixed: 0,
    typosCorrected: 0,
    whitespaceNormalized: 0,
    datesNormalized: 0,
    changes: [],
    confidenceScore: 0,
    preview: [],
  };

  let rows = [...dataset.rows.map((r) => ({ ...r }))];

  // 1. Remove duplicates
  const seen = new Set<string>();
  const noDups = rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) { report.duplicatesRemoved++; return false; }
    seen.add(key);
    return true;
  });
  if (report.duplicatesRemoved > 0) {
    report.changes.push(`🗑️ Removed ${report.duplicatesRemoved} duplicate rows`);
  }
  rows = noDups;

  // 2. Whitespace normalization & string trimming
  const { columns } = dataset.schema;
  columns.filter((c) => c.type === "string").forEach((col) => {
    rows.forEach((row, i) => {
      const val = row[col.name];
      if (typeof val === "string") {
        const cleaned = val.trim().replace(/\s+/g, " ");
        if (cleaned !== val) {
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: val,
              cleaned,
              reason: "Whitespace normalization",
            });
          }
          row[col.name] = cleaned;
          report.whitespaceNormalized++;
        }
      }
    });
  });
  if (report.whitespaceNormalized > 0) {
    report.changes.push(`✨ Normalized whitespace in ${report.whitespaceNormalized} cells`);
  }

  // 3. Fuzzy typo correction for categorical columns
  columns.filter((c) => c.type === "string" && c.uniqueCount <= 50 && c.uniqueCount > 1).forEach((col) => {
    const values = rows.map((r) => String(r[col.name] ?? "")).filter((v) => v !== "");
    const corrections = fixTypos(values);

    if (corrections.size > 0) {
      rows.forEach((row, i) => {
        const val = String(row[col.name] ?? "");
        const corrected = corrections.get(val);
        if (corrected) {
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: val,
              cleaned: corrected,
              reason: `Typo correction (similarity match)`,
            });
          }
          row[col.name] = corrected;
          report.typosCorrected++;
        }
      });
    }
  });
  if (report.typosCorrected > 0) {
    report.changes.push(`🔤 Corrected ${report.typosCorrected} suspected typos`);
  }

  // 4. Date normalization
  columns.filter((c) => c.type === "date").forEach((col) => {
    rows.forEach((row, i) => {
      const val = String(row[col.name] ?? "");
      if (val && !val.match(/^\d{4}-\d{2}-\d{2}/)) {
        const normalized = normalizeDate(val);
        if (normalized) {
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: val,
              cleaned: normalized,
              reason: "Date format normalization",
            });
          }
          row[col.name] = normalized;
          report.datesNormalized++;
        }
      }
    });
  });
  if (report.datesNormalized > 0) {
    report.changes.push(`📅 Normalized ${report.datesNormalized} date values`);
  }

  // 5. Fill missing values and fix types
  columns.forEach((col) => {
    const numericVals = rows
      .map((r) => Number(r[col.name]))
      .filter((n) => !isNaN(n));
    const mean = numericVals.length
      ? numericVals.reduce((a, b) => a + b, 0) / numericVals.length
      : 0;
    const modeCounts = new Map<string, number>();
    rows.forEach((r) => {
      const v = String(r[col.name] ?? "");
      if (v) modeCounts.set(v, (modeCounts.get(v) ?? 0) + 1);
    });
    const mode = [...modeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    rows.forEach((row, i) => {
      const val = row[col.name];
      if (val === null || val === undefined || val === "") {
        if (col.type === "number") {
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: val,
              cleaned: +mean.toFixed(4),
              reason: "Filled with column mean",
            });
          }
          row[col.name] = +mean.toFixed(4);
          report.missingFilled++;
        } else if (col.type === "string") {
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: val,
              cleaned: mode || "Unknown",
              reason: "Filled with mode value",
            });
          }
          row[col.name] = mode || "Unknown";
          report.missingFilled++;
        } else if (col.type === "boolean") {
          row[col.name] = false;
          report.missingFilled++;
        }
      }
    });
  });

  if (report.missingFilled > 0) report.changes.push(`📝 Filled ${report.missingFilled} missing values`);
  if (report.typesFixed > 0) report.changes.push(`🔧 Fixed ${report.typesFixed} type mismatches`);

  // 6. Handle outliers (cap to 3σ)
  columns
    .filter((c) => c.type === "number")
    .forEach((col) => {
      const vals = rows.map((r) => Number(r[col.name])).filter((n) => !isNaN(n));
      if (!vals.length) return;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      if (std === 0) return;
      const lower = mean - 3 * std;
      const upper = mean + 3 * std;
      rows.forEach((row, i) => {
        const v = Number(row[col.name]);
        if (!isNaN(v) && isOutlier(v, mean, std)) {
          const capped = +(Math.max(lower, Math.min(upper, v)).toFixed(4));
          if (report.preview.length < 50) {
            report.preview.push({
              row: i,
              column: col.name,
              original: v,
              cleaned: capped,
              reason: `Outlier capped (z-score > 3)`,
            });
          }
          row[col.name] = capped;
          report.outliersHandled++;
        }
      });
    });

  if (report.outliersHandled > 0) report.changes.push(`📊 Capped ${report.outliersHandled} outlier values to ±3σ`);

  report.cleanedRows = rows.length;

  // Calculate confidence score
  const totalChanges = report.duplicatesRemoved + report.missingFilled + report.outliersHandled + report.typosCorrected + report.whitespaceNormalized + report.datesNormalized;
  const totalCells = dataset.rows.length * dataset.schema.colCount;
  const changeRate = totalChanges / Math.max(totalCells, 1);
  report.confidenceScore = Math.round(Math.max(60, Math.min(99, 95 - changeRate * 200)));

  // Rebuild dataset with cleaned rows
  const cleaned = processRows(rows, dataset.name.replace(/\.(csv|xlsx?)$/i, "_cleaned.csv"));
  cleaned.id = dataset.id + "_cleaned";

  return { cleaned, report };
}
