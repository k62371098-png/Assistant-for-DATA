import type { ColumnMeta, ColumnType, DatasetSchema, Dataset } from "@/types";
import { generateId, isNumeric } from "@/lib/utils";
import { buildDatasetIntelligence } from "./intelligence";

// ── Type detection ────────────────────────────────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;
const SHORT_DATE_RE = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;

function detectType(samples: unknown[]): ColumnType {
  const nonNull = samples.filter((v) => v !== null && v !== undefined && v !== "");
  if (!nonNull.length) return "unknown";
  const numericCount = nonNull.filter((v) => isNumeric(v)).length;
  if (numericCount / nonNull.length > 0.8) return "number";
  const dateCount = nonNull.filter(
    (v) => typeof v === "string" && (ISO_DATE_RE.test(v) || SHORT_DATE_RE.test(v))
  ).length;
  if (dateCount / nonNull.length > 0.7) return "date";
  const boolCount = nonNull.filter(
    (v) => typeof v === "string" && ["true", "false", "yes", "no", "1", "0"].includes(v.toLowerCase())
  ).length;
  if (boolCount / nonNull.length > 0.8) return "boolean";
  return "string";
}

function coerceValue(val: unknown, type: ColumnType): unknown {
  if (val === null || val === undefined || val === "") return null;
  if (type === "number") {
    if (typeof val === "string" && val.includes(",")) val = val.replace(/,/g, "");
    const n = Number(val);
    return isNaN(n) ? null : n;
  }
  if (type === "boolean") {
    return ["true", "yes", "1"].includes(String(val).toLowerCase());
  }
  return val;
}

// ── Statistical helpers ───────────────────────────────────────────────────────
function numericStats(values: number[]) {
  if (!values.length) return { min: 0, max: 0, mean: 0, std: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { min, max, mean, std };
}

// ── Process raw rows → schema ─────────────────────────────────────────────────
export function processRows(
  rawRows: Record<string, unknown>[],
  filename: string
): Dataset {
  if (!rawRows.length) throw new Error("Dataset is empty");

  // Gather all unique keys across all rows to prevent dropping columns that are only in some rows
  const keySet = new Set<string>();
  rawRows.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
  const keys = Array.from(keySet);
  const columnMeta: ColumnMeta[] = keys.map((key) => {
    const samples = rawRows.slice(0, 200).map((r) => r[key]);
    const type = detectType(samples);
    const allVals = rawRows.map((r) => r[key]);
    const nullCount = allVals.filter((v) => v === null || v === undefined || v === "").length;
    const unique = new Set(allVals.map(String)).size;
    const stats =
      type === "number"
        ? numericStats(allVals.filter(isNumeric).map(Number))
        : { min: undefined, max: undefined, mean: undefined, std: undefined };

    return {
      name: key,
      type,
      nullCount,
      nullPercent: (nullCount / rawRows.length) * 100,
      uniqueCount: unique,
      min: stats.min,
      max: stats.max,
      mean: stats.mean,
      std: stats.std,
      sample: samples.slice(0, 5),
    };
  });

  // Coerce all values to correct types
  const coercedRows = rawRows.map((row) => {
    const newRow: Record<string, unknown> = {};
    columnMeta.forEach((col) => {
      newRow[col.name] = coerceValue(row[col.name], col.type);
    });
    return newRow;
  });

  // Quality score
  const missingTotal = columnMeta.reduce((a, c) => a + c.nullCount, 0);
  const missingPercent = (missingTotal / (rawRows.length * keys.length)) * 100;
  const serialized = JSON.stringify(coercedRows);
  const duplicateCount = rawRows.length - new Set(coercedRows.map((r) => JSON.stringify(r))).size;
  const duplicatePercent = (duplicateCount / rawRows.length) * 100;

  // Calculate anomalies/outliers
  let outlierTotal = 0;
  columnMeta.forEach((col) => {
    if (col.type === "number" && typeof col.mean === "number" && typeof col.std === "number" && col.std > 0) {
      coercedRows.forEach((r) => {
        const v = Number(r[col.name]);
        if (!isNaN(v) && Math.abs((v - col.mean!) / col.std!) > 2.5) outlierTotal++;
      });
    }
  });
  const outlierPercent = (outlierTotal / (rawRows.length * keys.length)) * 100;

  const qualityScore = Math.max(
    0,
    Math.round(100 - (missingPercent * 0.5) - (duplicatePercent * 0.3) - (outlierPercent * 0.5))
  );

  const schema: DatasetSchema = {
    columns: columnMeta,
    rowCount: rawRows.length,
    colCount: keys.length,
    duplicateCount,
    missingTotal,
    missingPercent,
    qualityScore,
  };

  const dataset: Dataset = {
    id: generateId(),
    name: filename,
    uploadedAt: new Date().toISOString(),
    rows: coercedRows,
    schema,
    size: serialized.length,
  };

  // Add intelligence
  dataset.schema.intelligence = buildDatasetIntelligence(dataset);

  return dataset;
}

// ── CSV parser (client-side with PapaParse) ───────────────────────────────────
export async function parseCsvText(text: string, filename: string): Promise<Dataset> {
  const Papa = (await import("papaparse")).default;
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (result.errors.length && !result.data.length) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }
  return processRows(result.data, filename);
}

// ── Excel parser ─────────────────────────────────────────────────────────────
export async function parseExcelBuffer(buffer: ArrayBuffer, filename: string): Promise<Dataset> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return processRows(rawRows, filename);
}

// ── File dispatcher ──────────────────────────────────────────────────────────
export async function parseFile(file: File): Promise<Dataset> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    const text = await file.text();
    return parseCsvText(text, file.name);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
    const buffer = await file.arrayBuffer();
    return parseExcelBuffer(buffer, file.name);
  }
  if (name.endsWith(".json")) {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data.data ?? Object.values(data);
    return processRows(rows, file.name);
  }
  throw new Error(`Unsupported file format: ${file.name.split(".").pop()?.toUpperCase()}`);
}
