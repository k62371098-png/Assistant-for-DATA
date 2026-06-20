import type { Dataset, ColumnMeta } from "@/types";

export interface IntentResult {
  type:
    | "metadata"
    | "value_search"
    | "column_lookup"
    | "row_lookup"
    | "missing_values"
    | "anomaly_scan"
    | "top_n"
    | "bottom_n"
    | "middle_n"
    | "row_filter"
    | "chart_request"
    | "random_row"
    | "random_column"
    | "reasoning";
  target?: string; // column name
  term?: string;   // search term
  position?: "top" | "bottom" | "middle";
  count?: number;  // N for top N
  operator?: string;
  value?: any;
  chartType?: "pie" | "donut" | "bar" | "line" | "scatter" | "area" | "horizontal_bar" | "histogram" | "box" | "treemap";
}

// Levenshtein distance for fuzzy search
export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

export class DataEngine {
  rows: Record<string, unknown>[];
  columns: ColumnMeta[];
  valueIndex: Record<string, { column: string; rowIndices: number[] }>;
  datasetName: string;

  constructor(dataset: Dataset) {
    this.rows = dataset.rows || [];
    this.columns = dataset.schema.columns || [];
    this.datasetName = dataset.name;
    this.valueIndex = this.buildValueIndex();
  }

  private buildValueIndex() {
    const index: Record<string, { column: string; rowIndices: number[] }> = {};
    this.rows.forEach((row, rowIdx) => {
      this.columns.forEach((col) => {
        const val = row[col.name];
        if (val !== null && val !== undefined && val !== "") {
          const strVal = String(val).toLowerCase();
          if (!index[strVal]) {
            index[strVal] = { column: col.name, rowIndices: [] };
          }
          if (!index[strVal].rowIndices.includes(rowIdx)) {
            index[strVal].rowIndices.push(rowIdx);
          }
        }
      });
    });
    return index;
  }

  getIdColumn(): string {
    const idCol = this.columns.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("id") || n.includes("name") || n === "student" || n === "person" || n === "user";
    });
    return idCol ? idCol.name : this.columns[0]?.name;
  }

  // POINT 7 — metadata
  getMetadata() {
    return {
      rowCount: this.rows.length,
      columnCount: this.columns.length,
      columns: this.columns.map((c) => ({ name: c.name, type: c.type })),
      datasetName: this.datasetName,
    };
  }

  // POINT 4 — column/row isolation
  getColumns(columnNames: string[]) {
    return columnNames.map((name) => {
      let col = this.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!col) col = this.columns.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      if (!col) return null;
      return {
        name: col.name,
        values: this.rows.map((r) => r[col!.name]),
        type: col.type,
      };
    }).filter(Boolean);
  }

  getRowsByIdentifier(identifier: string | number) {
    if (typeof identifier === "number") {
      return this.rows[identifier] ? [this.rows[identifier]] : [];
    }
    if (typeof identifier === "string" && !isNaN(Number(identifier))) {
      const idx = Number(identifier) - 1; // 1-indexed for humans
      if (idx >= 0 && idx < this.rows.length) return [this.rows[idx]];
    }
    const lowerId = String(identifier).toLowerCase();
    const indexEntry = this.valueIndex[lowerId];
    if (indexEntry && indexEntry.rowIndices.length > 0) {
      return indexEntry.rowIndices.map(idx => this.rows[idx]);
    }
    // fuzzy match across rows (partial match)
    return this.rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(lowerId))
    );
  }

  getRowsWhere(column: string, operator: string, value: any) {
    const colObj = this.columns.find((c) => c.name.toLowerCase() === column.toLowerCase());
    if (!colObj) return [];
    const actualCol = colObj.name;
    
    return this.rows
      .map((r, i) => ({ ...r, _originalIndex: i }))
      .filter((r) => {
        const val = (r as any)[actualCol];
        if (operator === ">") return Number(val) > Number(value);
        if (operator === "<") return Number(val) < Number(value);
        if (operator === ">=") return Number(val) >= Number(value);
        if (operator === "<=") return Number(val) <= Number(value);
        if (operator === "=" || operator === "==" || operator === "is" || operator === "equals") return String(val).toLowerCase() === String(value).toLowerCase();
        if (operator === "contains") return String(val).toLowerCase().includes(String(value).toLowerCase());
        return false;
      });
  }

  // POINT 5 — missing values + anomalies with EXACT location
  findMissingValues() {
    const result: Record<string, { count: number; rows: { rowIndex: number; rowIdentifier: unknown }[] }> = {};
    const idCol = this.getIdColumn();
    this.columns.forEach((col) => {
      const missingRows: { rowIndex: number; rowIdentifier: unknown }[] = [];
      this.rows.forEach((row, idx) => {
        if (row[col.name] === null || row[col.name] === "" || row[col.name] === undefined || (typeof row[col.name] === "number" && isNaN(row[col.name] as number))) {
          missingRows.push({ rowIndex: idx, rowIdentifier: row[idCol] ?? idx });
        }
      });
      if (missingRows.length > 0) {
        result[col.name] = { count: missingRows.length, rows: missingRows };
      }
    });
    return result;
  }

  findAnomalies() {
    const anomalies: any[] = [];
    const idCol = this.getIdColumn();
    this.columns
      .filter((c) => c.type === "number")
      .forEach((col) => {
        const mean = col.mean || 0;
        const std = col.std || 1;
        if (std === 0) return;
        this.rows.forEach((row, idx) => {
          const val = row[col.name];
          if (val != null && typeof val === "number" && !isNaN(val)) {
            if (Math.abs(val - mean) > 2.5 * std) {
              anomalies.push({
                column: col.name,
                rowIndex: idx,
                rowIdentifier: row[idCol] ?? idx,
                value: val,
                deviation: ((val - mean) / std).toFixed(1) + "σ",
                reason: `Value is unusually ${val > mean ? "high" : "low"}`,
              });
            }
          }
        });
      });
    return anomalies;
  }

  // POINT 6 — universal value search
  searchValue(searchTerm: string) {
    const exact = this.valueIndex[searchTerm.toLowerCase()];
    if (exact) return { found: true, exact: true, locations: exact };

    // fuzzy fallback
    const fuzzyMatches = Object.keys(this.valueIndex)
      .map((key) => ({ key, distance: levenshtein(searchTerm.toLowerCase(), key) }))
      .filter((m) => m.distance <= 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    if (fuzzyMatches.length > 0) {
      return {
        found: true,
        exact: false,
        suggestions: fuzzyMatches.map((m) => ({
          value: m.key,
          locations: this.valueIndex[m.key],
        })),
      };
    }
    return { found: false };
  }

  // POINT 3 — ranking
  getRankedSlice(column: string, position: "top" | "bottom" | "middle", count: number) {
    const colObj = this.columns.find((c) => c.name.toLowerCase() === column.toLowerCase());
    if (!colObj) return [];
    const actualCol = colObj.name;

    const sorted = [...this.rows]
      .map((r, i) => ({ ...r, _originalIndex: i }))
      .filter((r) => (r as any)[actualCol] !== null && (r as any)[actualCol] !== undefined)
      .sort((a, b) => {
        const valA = Number((a as any)[actualCol]);
        const valB = Number((b as any)[actualCol]);
        if (!isNaN(valA) && !isNaN(valB)) {
          return valB - valA; // desc by default
        }
        return String((b as any)[actualCol]).localeCompare(String((a as any)[actualCol]));
      });

    if (sorted.length === 0) return [];

    if (position === "top") return sorted.slice(0, count);
    if (position === "bottom") return sorted.slice(-count).reverse();
    if (position === "middle") {
      const mid = Math.floor(sorted.length / 2);
      const half = Math.floor(count / 2);
      return sorted.slice(Math.max(0, mid - half), mid + half + (count % 2));
    }
    return [];
  }
}

// POINT 6 — Intent extraction
export function extractIntent(message: string, dataEngine: DataEngine): IntentResult {
  const msg = message.toLowerCase();

  // Metadata patterns
  if (/how many (rows|columns|entries)/i.test(msg) || /what columns|list.*columns|show.*columns/i.test(msg)) {
    return { type: "metadata" };
  }
  const typeMatch = msg.match(/data type of (\w+)/i);
  if (typeMatch) {
    return { type: "metadata", target: typeMatch[1] };
  }

  // Value search patterns
  const searchMatch = msg.match(/does (.+) (exist|appear)/i) || msg.match(/is there (?:a|an)? ?(.+) in/i) || msg.match(/(?:find|search|look for) (.+)/i);
  if (searchMatch) {
    let term = searchMatch[1].trim();
    if (term.startsWith("'") && term.endsWith("'")) term = term.slice(1, -1);
    if (term.startsWith('"') && term.endsWith('"')) term = term.slice(1, -1);
    return { type: "value_search", term };
  }

  // Missing values
  if (/missing|null|empty|incomplete/i.test(msg)) {
    return { type: "missing_values" };
  }

  // Anomalies
  if (/anomal(y|ies)|outlier|unusual|suspicious|issue|problem/i.test(msg)) {
    return { type: "anomaly_scan" };
  }

  // Ranking patterns
  const rankMatch = msg.match(/(top|highest|best|most|maximum|bottom|lowest|worst|least|minimum|middle|average|median range) (\d+)?/i);
  if (rankMatch) {
    const posStr = rankMatch[1];
    let position: "top" | "bottom" | "middle" = "top";
    if (/bottom|lowest|worst|least|minimum/i.test(posStr)) position = "bottom";
    if (/middle|average|median/i.test(posStr)) position = "middle";
    
    let count = 5;
    if (rankMatch[2]) count = parseInt(rankMatch[2], 10);
    else if (msg.includes("10%")) count = Math.ceil(dataEngine.rows.length * 0.1);

    // try to find column
    let targetCol = dataEngine.columns.find((c) => msg.includes(c.name.toLowerCase()))?.name;
    if (!targetCol) {
      // fallback to first numeric col
      targetCol = dataEngine.columns.find((c) => c.type === "number")?.name;
    }
    
    return { type: `${position}_n` as any, count, target: targetCol };
  }

  // Filter patterns
  const filterMatch = msg.match(/where (.+) (>|<|=|is|equals|greater than|less than) (.+)/i);
  if (filterMatch) {
    return { type: "row_filter", target: filterMatch[1].trim(), operator: filterMatch[2].trim(), value: filterMatch[3].trim() };
  }

  // Column/row lookup
  const colLookup = msg.match(/show (?:me )?(?:only |just )?(?:the )?(.+) columns?/i);
  if (colLookup) {
    return { type: "column_lookup", target: colLookup[1].trim() };
  }

  const rowLookup = msg.match(/who is (.+)|details (?:of|for|about) (.+)|tell me about (.+)|show row (\d+)|row (\d+)|(?:profile|info|information|data) (?:of|for|about) (.+)/i);
  if (rowLookup) {
    return { type: "row_lookup", term: (rowLookup[1] || rowLookup[2] || rowLookup[3] || rowLookup[4] || rowLookup[5] || rowLookup[6]).trim() };
  }

  // Chart request
  const chartMatch = msg.match(/(pie|donut|bar|line|scatter|area|horizontal[_ ]bar|histogram|box|treemap)\s*(?:chart|plot|graph)?/i);
  if (chartMatch || /chart|graph|plot|visuali[sz]e|show.*as a/i.test(msg)) {
    let chartType = chartMatch ? chartMatch[1].toLowerCase().replace(" ", "_") : "bar";
    if (chartType === "horizontal bar") chartType = "horizontal_bar";
    return { type: "chart_request", chartType: chartType as any };
  }

  // Random patterns
  if (/(?:show|get|give me|pick) (?:a )?random row/i.test(msg)) {
    return { type: "random_row" };
  }
  if (/(?:show|get|give me|pick) (?:a )?random column/i.test(msg)) {
    return { type: "random_column" };
  }

  // If the exact message is a value in the dataset, treat it as a row lookup
  if (dataEngine.valueIndex[msg.trim()]) {
    return { type: "row_lookup", term: msg.trim() };
  }

  // Default fallback
  return { type: "reasoning" };
}
