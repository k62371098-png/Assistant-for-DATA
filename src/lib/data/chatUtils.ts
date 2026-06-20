export function classifyQuestion(message: string, columns: any[]): string {
  const m = message.toLowerCase();
  
  // Anomaly keywords
  if (m.includes("anomaly") || m.includes("outlier") || m.includes("missing") || m.includes("null") || m.includes("issue") || m.includes("problem")) {
    return "ANOMALY";
  }
  
  // Trend keywords
  if (m.includes("over time") || m.includes("trend") || m.includes("monthly") || m.includes("yearly") || m.includes("change")) {
    const hasDateCol = columns.some((c) => c.type === "date");
    if (hasDateCol) return "TREND";
  }

  // Ranking keywords
  if (
    m.includes("most") || m.includes("highest") || m.includes("lowest") || 
    m.includes("top") || m.includes("bottom") || m.includes("maximum") || 
    m.includes("minimum") || m.includes("best") || m.includes("worst") || 
    m.includes("largest") || m.includes("smallest") || m.includes("more") ||
    m.includes("who has") || m.includes("oldest") || m.includes("youngest")
  ) {
    return "RANKING";
  }

  // Distribution keywords
  if (
    m.includes("distribution") || m.includes("breakdown") || m.includes("how many") || 
    m.includes("count of") || m.includes("percentage") || m.includes("proportion") || 
    m.includes("by ")
  ) {
    return "DISTRIBUTION";
  }

  // Comparison keywords
  if (m.includes("compare") || m.includes("vs") || m.includes("versus") || m.includes("difference")) {
    return "COMPARISON";
  }

  // Lookup keywords
  if (m.includes("show me") || m.includes("list") || m.includes("what are") || m.includes("find rows") || m.includes("filter")) {
    return "LOOKUP";
  }

  // Summary keywords
  if (m.includes("summarize") || m.includes("describe") || m.includes("average") || m.includes("mean") || m.includes("overview")) {
    return "SUMMARY";
  }

  return "GENERAL";
}

export function extractColumnFromMessage(message: string, columnNames: string[]): string {
  const m = message.toLowerCase();
  
  // Perfect case-insensitive scanning for exact matches
  for (const name of columnNames) {
    if (m.includes(name.toLowerCase())) {
      return name;
    }
  }

  // Substring or fuzzy matching for common variants
  if (m.includes("age")) {
    const found = columnNames.find(c => c.toLowerCase().includes("age"));
    if (found) return found;
  }
  if (m.includes("number") || m.includes("mobile") || m.includes("phone")) {
    const found = columnNames.find(c => c.toLowerCase().includes("mobile") || c.toLowerCase().includes("phone") || c.toLowerCase().includes("number"));
    if (found) return found;
  }
  if (m.includes("name") || m.includes("person") || m.includes("who")) {
    const found = columnNames.find(c => c.toLowerCase().includes("name") || c.toLowerCase().includes("student") || c.toLowerCase().includes("user"));
    if (found) return found;
  }
  if (m.includes("salary") || m.includes("pay") || m.includes("income")) {
    const found = columnNames.find(c => c.toLowerCase().includes("salary") || c.toLowerCase().includes("income") || c.toLowerCase().includes("pay"));
    if (found) return found;
  }
  if (m.includes("sales") || m.includes("revenue") || m.includes("sold")) {
    const found = columnNames.find(c => c.toLowerCase().includes("sales") || c.toLowerCase().includes("revenue"));
    if (found) return found;
  }

  return columnNames[0] || "";
}

export function buildDatasetContext(dataset: any): string {
  const filename = dataset.name;
  const rowCount = dataset.rows.length;
  
  const columnsAndTypes = dataset.schema.columns.map((col: any) => {
    const colName = col.name;
    const type = col.type;
    const nullCount = col.nullCount || 0;
    
    if (type === "number") {
      // Find min, max, mean from real data if missing, or use meta
      const values = dataset.rows
        .map((r: any) => Number(r[colName]))
        .filter((n: any) => !isNaN(n) && n !== null && n !== undefined);
      
      const min = col.min !== undefined ? col.min : (values.length ? Math.min(...values) : 0);
      const max = col.max !== undefined ? col.max : (values.length ? Math.max(...values) : 0);
      const mean = col.mean !== undefined ? col.mean : (values.length ? (values.reduce((a: any, b: any) => a + b, 0) / values.length) : 0);
      const sample = values.slice(0, 3).join(", ");
      
      return `  - ${colName} | type: numeric | nulls: ${nullCount} | min: ${min}, max: ${max}, mean: ${mean.toFixed(2)}, sample values: [${sample}]`;
    } else {
      // Categorical/Text/Date
      // Compute top values dynamically from raw dataset rows
      const counts: Record<string, number> = {};
      dataset.rows.forEach((row: any) => {
        const val = String(row[colName] ?? "");
        if (val.trim()) {
          counts[val] = (counts[val] || 0) + 1;
        }
      });
      
      const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const unique = col.uniqueCount || sortedEntries.length;
      const topValues = sortedEntries
        .slice(0, 3)
        .map(([val, count]) => `"${val}"(${count})`)
        .join(", ");
        
      return `  - ${colName} | type: ${type} | nulls: ${nullCount} | unique: ${unique}, top values: ${topValues || "None"}`;
    }
  }).join("\n");

  return `DATASET: ${filename}
TOTAL ROWS: ${rowCount}
COLUMNS AND TYPES:
${columnsAndTypes}`;
}

export function synthesizeChartData(
  dataset: any,
  xAxisColumn: string,
  yAxisColumn: string,
  limit: number = 10,
  operation: string = "raw"
): { label: string; value: number }[] {
  const rows = dataset.rows;
  
  // Scan for actual column keys case-insensitively
  const keys = Object.keys(rows[0] || {});
  const xCol = keys.find(k => k.toLowerCase() === xAxisColumn.toLowerCase()) || xAxisColumn;
  const yCol = keys.find(k => k.toLowerCase() === yAxisColumn.toLowerCase()) || yAxisColumn;

  // Process based on operation
  if (operation === "groupby" || operation === "distribution") {
    const counts: Record<string, number[]> = {};
    rows.forEach((row: any) => {
      const label = String(row[xCol] ?? "Unknown");
      const val = Number(row[yCol]);
      if (!counts[label]) counts[label] = [];
      if (!isNaN(val)) counts[label].push(val);
    });

    return Object.entries(counts)
      .map(([label, vals]) => ({
        label,
        value: vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 1
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  // Ranking or lookup: get top rows sorted by yCol
  const mapped = rows
    .map((row: any) => {
      const label = String(row[xCol] ?? "Unknown");
      const val = parseFloat(String(row[yCol] ?? 0).replace(/,/g, ""));
      return { label, value: isNaN(val) ? 0 : val };
    })
    .filter((point: any) => !isNaN(point.value) && point.label !== "Unknown");

  // Sort descending by value
  mapped.sort((a: any, b: any) => b.value - a.value);
  return mapped.slice(0, limit);
}
