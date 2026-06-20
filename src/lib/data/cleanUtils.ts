// Enhanced cleaning utilities for the Clean Data page
import type { Dataset, ColumnMeta } from "@/types";

export type CleanColumnType = "numeric" | "text" | "categorical" | "date";

export interface ColumnIssue {
  type: "missing" | "whitespace" | "typo" | "outlier";
  count: number;
  label: string;
}

export interface ColumnRule {
  column: string;
  detectedType: CleanColumnType;
  strategy: string;
  customValue: string;
  enabled: boolean;
  issues: ColumnIssue[];
  autoSetByThreshold?: boolean;
}

export interface GlobalSettings {
  removeDuplicates: boolean;
  trimWhitespace: boolean;
  standardizeDates: boolean;
  flagOutliers: boolean;
  addQualityScore: boolean;
  preserveOriginals: boolean;
  missingThreshold: number;
}

export interface CleanLogEntry {
  icon: "check" | "warning" | "info";
  description: string;
  rowsAffected: number;
}

export type DiffChangeType = "changed" | "dropped" | "custom" | "none" | "auto-fill" | "custom-fill" | "fuzzy-merge";

export interface DiffCell {
  original: unknown;
  cleaned: unknown;
  changeType: DiffChangeType;
}

export function detectCleanType(col: ColumnMeta): CleanColumnType {
  if (col.type === "number") return "numeric";
  if (col.type === "date") return "date";
  if (col.type === "string" && col.uniqueCount <= 30) return "categorical";
  return "text";
}

export function getStrategiesForType(t: CleanColumnType): string[] {
  switch (t) {
    case "numeric":
      return ["Fill → Mean", "Fill → Median", "Fill → Mode", "Fill → Zero", "Fill → Custom Value", "Drop rows", "Flag only", "No action"];
    case "text":
      return ["Trim & normalize", "Uppercase", "Lowercase", "Title Case", "Fill → Custom Value", "Drop rows", "No action"];
    case "categorical":
      return ["Fuzzy merge", "Standardize values", "Fill → Custom Value", "Flag only", "No action"];
    case "date":
      return ["Standardize format", "Fill → Custom Value", "Drop rows", "Flag only", "No action"];
  }
}

export function detectColumnIssues(col: ColumnMeta, rows: Record<string, unknown>[]): ColumnIssue[] {
  const issues: ColumnIssue[] = [];
  if (col.nullCount > 0) issues.push({ type: "missing", count: col.nullCount, label: `${col.nullCount} missing` });

  if (col.type === "string") {
    let wsCount = 0;
    rows.forEach((r) => {
      const v = r[col.name];
      if (typeof v === "string" && v !== v.trim()) wsCount++;
    });
    if (wsCount > 0) issues.push({ type: "whitespace", count: wsCount, label: `${wsCount} whitespace` });
  }

  if (col.type === "number" && typeof col.mean === "number" && typeof col.std === "number" && col.std > 0) {
    let outlierCount = 0;
    rows.forEach((r) => {
      const v = Number(r[col.name]);
      if (!isNaN(v) && Math.abs((v - col.mean!) / col.std!) > 2.5) outlierCount++;
    });
    if (outlierCount > 0) issues.push({ type: "outlier", count: outlierCount, label: `${outlierCount} outliers` });
  }

  return issues;
}

export function buildColumnRules(dataset: Dataset, settings?: GlobalSettings): ColumnRule[] {
  return dataset.schema.columns.map((col) => {
    const detectedType = detectCleanType(col);
    const strategies = getStrategiesForType(detectedType);
    const issues = detectColumnIssues(col, dataset.rows);
    
    let strategy = strategies[0];
    let autoSetByThreshold = false;
    
    // If threshold setting provided and column exceeds it, auto-set to "Drop rows"
    if (settings && col.nullPercent > settings.missingThreshold && strategies.includes("Drop rows")) {
      strategy = "Drop rows";
      autoSetByThreshold = true;
    }
    
    return {
      column: col.name,
      detectedType,
      strategy,
      customValue: "",
      enabled: true,
      issues,
      autoSetByThreshold,
    };
  });
}

export function computeDatasetStats(dataset: Dataset) {
  const rows = dataset.rows;
  const cols = dataset.schema.columns;
  let missing = 0;
  rows.forEach((r) => cols.forEach((c) => {
    const v = r[c.name];
    if (v === null || v === undefined || v === "") missing++;
  }));

  let outliers = 0;
  cols.filter((c) => c.type === "number" && typeof c.mean === "number" && typeof c.std === "number" && c.std > 0).forEach((c) => {
    rows.forEach((r) => {
      const v = Number(r[c.name]);
      if (!isNaN(v) && Math.abs((v - c.mean!) / c.std!) > 2.5) outliers++;
    });
  });

  return {
    totalRows: rows.length,
    missingValues: missing,
    duplicates: dataset.schema.duplicateCount,
    outliers,
  };
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mode(arr: unknown[]): unknown {
  const counts = new Map<string, number>();
  arr.forEach((v) => { const k = String(v); counts.set(k, (counts.get(k) ?? 0) + 1); });
  let best = "", bestN = 0;
  counts.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
  return best;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Try to parse a date string with multiple format attempts
function tryParseDate(v: string): Date | null {
  // Direct ISO parse
  const d1 = new Date(v);
  if (!isNaN(d1.getTime())) return d1;
  
  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d2 = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d2.getTime())) return d2;
  }
  
  // MM-DD-YYYY
  const mmddyyyy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    const d3 = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d3.getTime())) return d3;
  }
  
  // Timestamp (numeric)
  if (/^\d{10,13}$/.test(v)) {
    const ts = Number(v);
    const d4 = new Date(ts > 1e11 ? ts : ts * 1000);
    if (!isNaN(d4.getTime())) return d4;
  }
  
  return null;
}

export function applyRules(
  dataset: Dataset,
  rules: ColumnRule[],
  settings: GlobalSettings
): { cleanedRows: Record<string, unknown>[]; log: CleanLogEntry[] } {
  let rows = dataset.rows.map((r) => ({ ...r }));
  const log: CleanLogEntry[] = [];

  // Track which columns were preserved
  const preservedCols = new Set<string>();
  
  // Helper to preserve original
  const preserveOriginal = (r: Record<string, unknown>, col: string) => {
    if (settings.preserveOriginals && r[`${col}_original`] === undefined) {
      r[`${col}_original`] = r[col];
      preservedCols.add(col);
    }
  };

  // ──────────────────────────────────────
  // Step 1: Preserve original columns (we do this lazily in preserveOriginal)
  // ──────────────────────────────────────

  // ──────────────────────────────────────
  // Step 2: Global: trim whitespace (before per-column strategies)
  // ──────────────────────────────────────
  if (settings.trimWhitespace) {
    let count = 0;
    const modifiedCols = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => {
      if (typeof r[k] === "string" && !k.endsWith('_original') && !k.endsWith('_flag') && !k.endsWith('_outlier_flag') && k !== 'quality_score') {
        const t = (r[k] as string).trim().replace(/\s+/g, " ");
        if (t !== r[k]) {
          preserveOriginal(r, k);
          r[k] = t;
          count++;
          modifiedCols.add(k);
        }
      }
    }));
    if (count > 0) log.push({ icon: "check", description: `Trimmed whitespace in ${count} cells across ${modifiedCols.size} text columns`, rowsAffected: count });
  }

  // ──────────────────────────────────────
  // Step 3: Global: standardize dates
  // ──────────────────────────────────────
  if (settings.standardizeDates) {
    let dateCount = 0;
    const dateCols = new Set<string>();
    let unparsed = 0;
    const unparsedCols = new Set<string>();
    dataset.schema.columns.filter(c => c.type === 'date').forEach(c => {
      rows.forEach(r => {
        const v = r[c.name];
        if (typeof v === 'string' && v) {
          const d = tryParseDate(v);
          if (d) {
            const newD = d.toISOString().split("T")[0];
            if (newD !== v) {
              preserveOriginal(r, c.name);
              r[c.name] = newD;
              dateCount++;
              dateCols.add(c.name);
            }
          } else {
            unparsed++;
            unparsedCols.add(c.name);
          }
        }
      });
    });
    if (dateCount > 0) log.push({ icon: "check", description: `Standardized ${dateCount} dates across ${dateCols.size} columns to YYYY-MM-DD`, rowsAffected: dateCount });
    if (unparsed > 0) log.push({ icon: "warning", description: `${unparsed} date values in [${Array.from(unparsedCols).join(', ')}] could not be parsed — left unchanged`, rowsAffected: unparsed });
  }

  // ──────────────────────────────────────
  // Step 4: Global: remove duplicates
  // ──────────────────────────────────────
  if (settings.removeDuplicates) {
    const seen = new Set<string>();
    const before = rows.length;
    rows = rows.filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
    const removed = before - rows.length;
    if (removed > 0) log.push({ icon: "check", description: `Removed ${removed} duplicate rows`, rowsAffected: removed });
  }

  // ──────────────────────────────────────
  // Step 5: Per-column strategies
  // ──────────────────────────────────────
  rules.filter((r) => r.enabled && r.strategy !== "No action").forEach((rule) => {
    const col = dataset.schema.columns.find((c) => c.name === rule.column);
    if (!col) return;
    const numVals = rows.map((r) => Number(r[rule.column])).filter((n) => !isNaN(n));
    const meanVal = numVals.length ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;
    const medianVal = numVals.length ? median(numVals) : 0;
    const modeVal = mode(rows.map((r) => r[rule.column]).filter((v) => v !== null && v !== undefined && v !== ""));
    let affected = 0;
    let dropped = 0;

    // Pre-compute fuzzy map if needed
    let fuzzyMap = new Map<string, string>();
    if (rule.strategy === "Fuzzy merge") {
      const counts = new Map<string, number>();
      rows.forEach(r => {
        const v = String(r[rule.column] ?? "");
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      });
      const uniqueVals = Array.from(counts.keys());
      
      // Group by levenshtein distance ≤ 2
      const groups: Map<string, string[]> = new Map();
      const assigned = new Set<string>();
      
      for (let i = 0; i < uniqueVals.length; i++) {
        if (assigned.has(uniqueVals[i])) continue;
        const group = [uniqueVals[i]];
        assigned.add(uniqueVals[i]);
        for (let j = i + 1; j < uniqueVals.length; j++) {
          if (assigned.has(uniqueVals[j])) continue;
          if (levenshtein(uniqueVals[i].toLowerCase(), uniqueVals[j].toLowerCase()) <= 2) {
            group.push(uniqueVals[j]);
            assigned.add(uniqueVals[j]);
          }
        }
        if (group.length > 1) {
          // Find the most frequent spelling in the group
          let maxCount = 0, canonical = group[0];
          group.forEach(v => {
            const c = counts.get(v) ?? 0;
            if (c > maxCount) { maxCount = c; canonical = v; }
          });
          group.forEach(v => {
            if (v !== canonical) fuzzyMap.set(v, canonical);
          });
        }
      }
    }

    rows = rows.filter((r) => {
      const v = r[rule.column];
      const isEmpty = v === null || v === undefined || v === "";

      switch (rule.strategy) {
        case "Fill → Mean":
          if (isEmpty) { preserveOriginal(r, rule.column); r[rule.column] = +meanVal.toFixed(4); affected++; }
          break;
        case "Fill → Median":
          if (isEmpty) { preserveOriginal(r, rule.column); r[rule.column] = +medianVal.toFixed(4); affected++; }
          break;
        case "Fill → Mode":
          if (isEmpty) { preserveOriginal(r, rule.column); r[rule.column] = modeVal; affected++; }
          break;
        case "Fill → Zero":
          if (isEmpty) { preserveOriginal(r, rule.column); r[rule.column] = 0; affected++; }
          break;
        case "Fill → Custom Value":
          if (isEmpty && rule.customValue !== undefined && rule.customValue !== "") {
            preserveOriginal(r, rule.column);
            r[rule.column] = rule.customValue;
            affected++;
          }
          break;
        case "Drop rows":
          if (isEmpty) { dropped++; return false; }
          break;
        case "Flag only":
          if (isEmpty || (col.type === 'number' && typeof col.mean === 'number' && typeof col.std === 'number' && col.std > 0 && Math.abs((Number(v) - col.mean!) / col.std!) > 2.5)) {
            r[`${rule.column}_flag`] = true;
            affected++;
          }
          break;
        case "Trim & normalize":
          if (typeof v === "string") {
            const t = v.trim().replace(/\s+/g, " ");
            if (t !== v) { preserveOriginal(r, rule.column); r[rule.column] = t; affected++; }
          }
          break;
        case "Fuzzy merge":
          if (typeof v === "string" && fuzzyMap.has(v)) {
            preserveOriginal(r, rule.column);
            r[rule.column] = fuzzyMap.get(v);
            affected++;
          }
          break;
        case "Standardize values":
          if (typeof v === "string" && v) {
            const standardized = titleCase(v.trim());
            if (standardized !== v) {
              preserveOriginal(r, rule.column);
              r[rule.column] = standardized;
              affected++;
            }
          }
          break;
        case "Uppercase":
          if (typeof v === "string") {
            const upper = v.toUpperCase();
            if (upper !== v) { preserveOriginal(r, rule.column); r[rule.column] = upper; affected++; }
          }
          break;
        case "Lowercase":
          if (typeof v === "string") {
            const lower = v.toLowerCase();
            if (lower !== v) { preserveOriginal(r, rule.column); r[rule.column] = lower; affected++; }
          }
          break;
        case "Title Case":
          if (typeof v === "string") {
            const tc = titleCase(v);
            if (tc !== v) { preserveOriginal(r, rule.column); r[rule.column] = tc; affected++; }
          }
          break;
        case "Standardize format":
          if (typeof v === "string" && v) {
            const d = tryParseDate(v);
            if (d) {
              const nd = d.toISOString().split("T")[0];
              if (nd !== v) { preserveOriginal(r, rule.column); r[rule.column] = nd; affected++; }
            }
          }
          break;
        case "No action":
          break;
        default:
          break;
      }
      return true;
    });

    if (affected > 0) {
      let desc = `${rule.column}: ${rule.strategy} applied`;
      if (rule.strategy.startsWith("Fill")) {
        const fillVal = rule.strategy === "Fill → Custom Value" ? `'${rule.customValue}'`
          : rule.strategy === "Fill → Median" ? medianVal.toFixed(2)
          : rule.strategy === "Fill → Mean" ? meanVal.toFixed(2)
          : rule.strategy === "Fill → Mode" ? `'${modeVal}'`
          : "0";
        desc = `Filled ${affected} nulls in [${rule.column}] with ${rule.strategy.split("→ ")[1]?.toLowerCase() || 'value'} ${fillVal}`;
      } else if (rule.strategy === "Fuzzy merge") {
        desc = `Corrected ${affected} fuzzy variants in [${rule.column}] → all normalized to majority spelling`;
      } else if (rule.strategy === "Standardize values") {
        desc = `Standardized ${affected} values in [${rule.column}] → trimmed + title-cased`;
      } else if (rule.strategy === "Flag only") {
        desc = `Flagged ${affected} issues in [${rule.column}] → ${rule.column}_flag column added`;
      } else if (rule.strategy === "Trim & normalize") {
        desc = `Trimmed whitespace in ${affected} cells in [${rule.column}]`;
      } else if (rule.strategy === "Uppercase") {
        desc = `Uppercased ${affected} values in [${rule.column}]`;
      } else if (rule.strategy === "Lowercase") {
        desc = `Lowercased ${affected} values in [${rule.column}]`;
      } else if (rule.strategy === "Title Case") {
        desc = `Title-cased ${affected} values in [${rule.column}]`;
      } else if (rule.strategy === "Standardize format") {
        desc = `Standardized ${affected} date formats in [${rule.column}] to YYYY-MM-DD`;
      }
      log.push({ icon: "check", description: desc, rowsAffected: affected });
    }
    if (dropped > 0) {
      log.push({ icon: "warning", description: `Dropped ${dropped} rows missing [${rule.column}]`, rowsAffected: dropped });
    }
  });

  // ──────────────────────────────────────
  // Step 6: Global: flag outliers
  // ──────────────────────────────────────
  if (settings.flagOutliers) {
    let flagged = 0;
    let outCols = new Set<string>();
    dataset.schema.columns.filter((c) => c.type === "number" && typeof c.mean === "number" && typeof c.std === "number" && c.std > 0).forEach((c) => {
      rows.forEach((r) => {
        const v = Number(r[c.name]);
        if (!isNaN(v) && Math.abs((v - c.mean!) / c.std!) > 2.5) {
          r[`${c.name}_outlier_flag`] = true;
          flagged++;
          outCols.add(c.name);
        }
      });
    });
    if (flagged > 0) {
      const colArr = Array.from(outCols);
      log.push({ icon: "warning", description: `Flagged ${flagged} outliers across ${colArr.length} columns → ${colArr.map(c => `${c}_outlier_flag`).join(', ')} added`, rowsAffected: flagged });
    }
  }

  // ──────────────────────────────────────
  // Step 7: Global: add quality score
  // ──────────────────────────────────────
  if (settings.addQualityScore) {
    const totalCols = dataset.schema.columns.length;
    rows.forEach((r) => {
      const keys = Object.keys(r).filter(k => !k.endsWith('_original') && !k.endsWith('_flag') && !k.endsWith('_outlier_flag') && k !== 'quality_score');
      const missingCount = keys.filter((k) => r[k] === null || r[k] === undefined || r[k] === "").length;
      r["quality_score"] = Math.round(Math.max(0, 100 - (missingCount * (100 / totalCols))));
    });
    log.push({ icon: "check", description: "Added quality_score column", rowsAffected: rows.length });
  }

  // Log preserved originals
  if (settings.preserveOriginals && preservedCols.size > 0) {
    log.push({ icon: "check", description: `Preserved ${preservedCols.size} original columns (${Array.from(preservedCols).map(c => `${c}_original`).join(', ')} added)`, rowsAffected: rows.length });
  }

  return { cleanedRows: rows, log };
}

export interface DiffSummary {
  cellChanges: number;
  rowsDropped: number;
  newColumns: number;
}

export function generateDiffRows(
  original: Record<string, unknown>[],
  cleaned: Record<string, unknown>[],
  rules: ColumnRule[],
  count = 500
): { columns: string[]; rows: { rowIdx: number; cells: Record<string, DiffCell>; hasChange: boolean }[]; summary: DiffSummary } {
  const origCols = Object.keys(original[0] ?? {});
  const cleanCols = Object.keys(cleaned[0] ?? {});
  const columns = Array.from(new Set([...origCols, ...cleanCols]));
  
  // Build a map of rule strategies for quick lookup
  const strategyMap = new Map<string, string>();
  rules.forEach(r => strategyMap.set(r.column, r.strategy));
  
  const result: { rowIdx: number; cells: Record<string, DiffCell>; hasChange: boolean }[] = [];
  const changedColumns = new Set<string>();
  let totalCellChanges = 0;
  let totalRowsDropped = 0;
  const newCols = cleanCols.filter(c => !origCols.includes(c));

  // Count dropped rows (rows that exist in original but not in cleaned due to length diff)
  totalRowsDropped = original.length - cleaned.length;

  for (let i = 0; i < Math.min(count, original.length); i++) {
    const orig = original[i] ?? {};
    const clean = i < cleaned.length ? cleaned[i] : null;
    const cells: Record<string, DiffCell> = {};
    let hasChange = false;
    
    columns.forEach((col) => {
      const o = orig[col];
      const c = clean ? clean[col] : undefined;
      
      if (!clean) {
        // Row was dropped
        cells[col] = { original: o, cleaned: undefined, changeType: "dropped" };
        changedColumns.add(col);
        hasChange = true;
      } else if (origCols.includes(col) && !cleanCols.includes(col)) {
        // Column was dropped
        cells[col] = { original: o, cleaned: undefined, changeType: "dropped" };
        changedColumns.add(col);
        hasChange = true;
      } else if (!origCols.includes(col) && cleanCols.includes(col)) {
        // New column added (flag, quality_score, _original, etc.)
        cells[col] = { original: undefined, cleaned: c, changeType: "custom" };
        changedColumns.add(col);
        hasChange = true;
        totalCellChanges++;
      } else if (String(o ?? "") !== String(c ?? "")) {
        // Value changed — determine the type of change
        const strategy = strategyMap.get(col) || "";
        let changeType: DiffChangeType = "changed";
        
        const wasEmpty = o === null || o === undefined || o === "";
        if (wasEmpty && strategy === "Fill → Custom Value") {
          changeType = "custom-fill";
        } else if (wasEmpty && strategy.startsWith("Fill →")) {
          changeType = "auto-fill";
        } else if (strategy === "Fuzzy merge" || strategy === "Standardize values") {
          changeType = "fuzzy-merge";
        } else {
          changeType = "changed";
        }
        
        cells[col] = { original: o, cleaned: c, changeType };
        changedColumns.add(col);
        hasChange = true;
        totalCellChanges++;
      } else {
        cells[col] = { original: o, cleaned: c, changeType: "none" };
      }
    });
    result.push({ rowIdx: i, cells, hasChange });
  }

  // Sort columns: those with changes appear first
  columns.sort((a, b) => {
    const aChanged = changedColumns.has(a);
    const bChanged = changedColumns.has(b);
    if (aChanged && !bChanged) return -1;
    if (!aChanged && bChanged) return 1;
    return 0;
  });

  return {
    columns,
    rows: result,
    summary: {
      cellChanges: totalCellChanges,
      rowsDropped: totalRowsDropped,
      newColumns: newCols.length,
    }
  };
}
