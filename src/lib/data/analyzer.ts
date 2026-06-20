import type { Dataset, QueryPlan, QueryResult, FilterClause, AggregationType } from "@/types";

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregate(values: number[], type: AggregationType): number {
  if (!values.length) return 0;
  switch (type) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "mean": return values.reduce((a, b) => a + b, 0) / values.length;
    case "count": return values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "median": {
      const s = [...values].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    }
    default: return values.reduce((a, b) => a + b, 0);
  }
}

// ── Filter rows ───────────────────────────────────────────────────────────────
function applyFilter(row: Record<string, unknown>, f: FilterClause): boolean {
  const keys = Object.keys(row);
  const actualCol = keys.find(k => k.toLowerCase() === f.column.toLowerCase()) || f.column;
  const val = row[actualCol];
  const fVal = f.value;
  
  if (val === undefined || val === null) return false;
  switch (f.operator) {
    case "eq": return String(val) === String(fVal);
    case "neq": return String(val) !== String(fVal);
    case "gt": return Number(val) > Number(fVal);
    case "gte": return Number(val) >= Number(fVal);
    case "lt": return Number(val) < Number(fVal);
    case "lte": return Number(val) <= Number(fVal);
    case "contains": return String(val).toLowerCase().includes(String(fVal).toLowerCase());
    case "not_contains": return !String(val).toLowerCase().includes(String(fVal).toLowerCase());
    default: return true;
  }
}

function applyFilters(rows: Record<string, unknown>[], filters?: FilterClause[]) {
  if (!filters?.length) return rows;
  return rows.filter((row) => filters.every((f) => applyFilter(row, f)));
}

// ── Main query runner ─────────────────────────────────────────────────────────
export function runQuery(dataset: Dataset, plan: QueryPlan): QueryResult {
  const start = performance.now();
  let rows = applyFilters(dataset.rows, plan.filters);
  let data: Record<string, unknown>[] = [];
  let anomalyIndices: number[] | undefined;

  const op = plan.operation;

  if (op === "describe") {
    data = dataset.schema.columns.map((c) => ({
      Column: c.name,
      Type: c.type,
      "Missing%": c.nullPercent.toFixed(1) + "%",
      Unique: c.uniqueCount,
      Min: c.min ?? "—",
      Max: c.max ?? "—",
      Mean: typeof c.mean === "number" ? c.mean.toFixed(2) : "—",
    }));
    if (!plan.chart) plan = { ...plan, chart: { type: "table" } };

  } else if (op === "raw") {
    const cols = plan.columns ?? Object.keys(rows[0] ?? {});
    data = rows.slice(0, plan.limit ?? 100).map((r) =>
      Object.fromEntries(cols.map((c) => [c, r[c]]))
    );
    if (!plan.chart) plan = { ...plan, chart: { type: "table" } };

  } else if (op === "histogram" && plan.metric) {
    // Generate histogram bins
    const values = rows.map((r) => Number(r[plan.metric!])).filter((n) => !isNaN(n));
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
      const binWidth = (max - min) / binCount || 1;
      const bins: Record<string, number> = {};

      for (let i = 0; i < binCount; i++) {
        const binStart = min + i * binWidth;
        const binEnd = binStart + binWidth;
        const label = `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`;
        bins[label] = 0;
      }

      values.forEach((v) => {
        const binIndex = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
        const binStart = min + binIndex * binWidth;
        const binEnd = binStart + binWidth;
        const label = `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`;
        bins[label] = (bins[label] ?? 0) + 1;
      });

      data = Object.entries(bins).map(([range, count]) => ({ range, count }));
      if (!plan.chart) plan = { ...plan, chart: { type: "bar", x: "range", y: "count" } };
    }

  } else if (op === "anomaly_detect" && plan.metric) {
    // Detect and return anomalous rows
    const values = rows.map((r) => Number(r[plan.metric!])).filter((n) => !isNaN(n));
    if (values.length >= 5) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      anomalyIndices = [];

      data = rows.map((r, i) => {
        const v = Number(r[plan.metric!]);
        const z = std > 0 ? Math.abs((v - mean) / std) : 0;
        const isAnomaly = z > 2.5;
        if (isAnomaly) anomalyIndices!.push(i);
        return { ...r, _zScore: +z.toFixed(2), _isAnomaly: isAnomaly };
      }).filter((r) => r._isAnomaly);

      data.sort((a, b) => Number(b._zScore) - Number(a._zScore));
      data = data.slice(0, plan.limit ?? 20);
    }
    if (!plan.chart) plan = { ...plan, chart: { type: "table" } };

  } else if (op === "groupby" && plan.groupBy?.length) {
    const groups = new Map<string, { key: Record<string, unknown>; vals: number[] }>();
    rows.forEach((row) => {
      const keyObj = Object.fromEntries((plan.groupBy ?? []).map((g) => [g, row[g]]));
      const keyStr = JSON.stringify(keyObj);
      if (!groups.has(keyStr)) groups.set(keyStr, { key: keyObj, vals: [] });
      const metricVal = plan.metric ? Number(row[plan.metric]) : 1;
      if (!isNaN(metricVal)) groups.get(keyStr)!.vals.push(metricVal);
    });
    const valueKey = plan.metric ?? "count";
    data = [...groups.values()].map((g) => ({
      ...g.key,
      [valueKey]: aggregate(g.vals.length ? g.vals : Array(g.vals.length || 1).fill(1), plan.agg ?? (plan.metric ? "sum" : "count")),
    }));
    if (plan.sort) {
      data.sort((a, b) =>
        plan.sort!.direction === "desc"
          ? Number(b[plan.sort!.column]) - Number(a[plan.sort!.column])
          : Number(a[plan.sort!.column]) - Number(b[plan.sort!.column])
      );
    } else {
      data.sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
    }
    if (plan.limit) data = data.slice(0, plan.limit);

  } else if (op === "timeseries" && plan.timeColumn) {
    const groups = new Map<string, number[]>();
    rows.forEach((row) => {
      const key = String(row[plan.timeColumn!] ?? "").slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      const v = plan.metric ? Number(row[plan.metric]) : 1;
      if (!isNaN(v)) groups.get(key)!.push(v);
    });
    const valueKey = plan.metric ?? "value";
    data = [...groups.entries()]
      .map(([k, vs]) => ({ [plan.timeColumn!]: k, [valueKey]: aggregate(vs, plan.agg ?? "sum") }))
      .sort((a, b) => String(a[plan.timeColumn!]).localeCompare(String(b[plan.timeColumn!])));
    if (plan.limit) data = data.slice(0, plan.limit);

  } else if (op === "sort") {
    const col = plan.sort?.column ?? plan.metric ?? Object.keys(rows[0] ?? {})[0];
    data = [...rows]
      .sort((a, b) =>
        plan.sort?.direction === "desc"
          ? Number(b[col]) - Number(a[col])
          : Number(a[col]) - Number(b[col])
      )
      .slice(0, plan.limit ?? 20);

  } else if (op === "top_n") {
    const col = plan.metric ?? Object.keys(rows[0] ?? {})[0];
    data = [...rows]
      .sort((a, b) => Number(b[col]) - Number(a[col]))
      .slice(0, plan.limit ?? 10);

  } else if (op === "aggregate" && plan.metric) {
    const vals = rows.map((r) => Number(r[plan.metric!])).filter((n) => !isNaN(n));
    const valueKey = plan.metric;
    data = [{ metric: plan.metric, [valueKey]: aggregate(vals, plan.agg ?? "sum") }];

  } else if (op === "correlation") {
    const numCols = dataset.schema.columns.filter((c) => c.type === "number").map((c) => c.name);
    data = numCols.flatMap((c1) =>
      numCols.map((c2) => {
        const vs1 = rows.map((r) => Number(r[c1])).filter((n) => !isNaN(n));
        const vs2 = rows.map((r) => Number(r[c2])).filter((n) => !isNaN(n));
        const n = Math.min(vs1.length, vs2.length);
        if (n < 2) return { column1: c1, column2: c2, correlation: 0 };
        const m1 = vs1.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const m2 = vs2.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const num = vs1.slice(0, n).reduce((a, v, i) => a + (v - m1) * (vs2[i] - m2), 0);
        const d1 = Math.sqrt(vs1.slice(0, n).reduce((a, v) => a + (v - m1) ** 2, 0));
        const d2 = Math.sqrt(vs2.slice(0, n).reduce((a, v) => a + (v - m2) ** 2, 0));
        return { column1: c1, column2: c2, correlation: d1 * d2 === 0 ? 0 : +(num / (d1 * d2)).toFixed(4) };
      })
    );

  } else {
    // Fallback: show raw preview
    data = rows.slice(0, plan.limit ?? 50);
    if (!plan.chart) plan = { ...plan, chart: { type: "table" } };
  }

  // Auto-infer chart if not specified
  if (!plan.chart && data.length) {
    plan = { ...plan, chart: inferChart(dataset, plan, data) };
  }

  return {
    plan,
    data,
    explanation: plan.explanation,
    durationMs: performance.now() - start,
    rowCount: data.length,
    anomalyIndices,
  };
}

// ── Smart chart selection engine ──────────────────────────────────────────────
function inferChart(
  dataset: Dataset,
  plan: QueryPlan,
  data: Record<string, unknown>[]
): QueryPlan["chart"] {
  if (!data.length) return { type: "table" };
  const keys = Object.keys(data[0]);
  const numericKeys = keys.filter((k) => typeof data[0][k] === "number");
  const stringKeys = keys.filter((k) => typeof data[0][k] === "string");
  const timeCol = dataset.schema.columns.find((c) => c.type === "date")?.name;

  // Time series → line chart
  if (plan.operation === "timeseries" || (timeCol && keys.includes(timeCol))) {
    return { type: "line", x: timeCol ?? stringKeys[0], y: numericKeys[0] ?? keys[1] };
  }

  // Correlation → heatmap or scatter
  if (plan.operation === "correlation") {
    return { type: "scatter", x: "column1", y: "correlation" };
  }

  // Histogram → bar
  if (plan.operation === "histogram") {
    return { type: "bar", x: "range", y: "count" };
  }

  // String + numeric combinations
  if (stringKeys.length && numericKeys.length) {
    const uniqueVals = new Set(data.map((r) => r[stringKeys[0]])).size;

    // Few categories → pie/donut
    if (uniqueVals <= 5) return { type: "pie", x: stringKeys[0], y: numericKeys[0] };
    if (uniqueVals <= 8) return { type: "donut", x: stringKeys[0], y: numericKeys[0] };

    // Many categories → bar
    return { type: "bar", x: stringKeys[0], y: numericKeys[0] };
  }

  // Two numeric → scatter
  if (numericKeys.length >= 2) return { type: "scatter", x: numericKeys[0], y: numericKeys[1] };

  return { type: "table" };
}

// ── Auto dashboard charts (Enhanced) ──────────────────────────────────────────
export function buildDashboardCharts(dataset: Dataset): QueryResult[] {
  const results: QueryResult[] = [];
  const { columns } = dataset.schema;
  const numCols = columns.filter((c) => c.type === "number");
  const catCols = columns.filter((c) => c.type === "string" && c.uniqueCount <= 30);
  const timeCols = columns.filter((c) => c.type === "date");

  // 1. Bar: categorical vs first numeric
  if (catCols.length && numCols.length) {
    const plan: QueryPlan = {
      operation: "groupby",
      title: `${numCols[0].name} by ${catCols[0].name}`,
      groupBy: [catCols[0].name],
      metric: numCols[0].name,
      agg: "sum",
      limit: 15,
      explanation: `Total ${numCols[0].name} grouped by ${catCols[0].name}.`,
      chart: { type: "bar", x: catCols[0].name, y: numCols[0].name },
    };
    results.push(runQuery(dataset, plan));
  }

  // 2. Line: time series
  if (timeCols.length && numCols.length) {
    const plan: QueryPlan = {
      operation: "timeseries",
      title: `${numCols[0].name} Over Time`,
      timeColumn: timeCols[0].name,
      metric: numCols[0].name,
      agg: "sum",
      explanation: `${numCols[0].name} trend over time.`,
      chart: { type: "line", x: timeCols[0].name, y: numCols[0].name },
    };
    results.push(runQuery(dataset, plan));
  }

  // 3. Pie/Donut: distribution of first categorical
  if (catCols.length) {
    const uniqueCount = catCols[0].uniqueCount;
    const chartType = uniqueCount <= 5 ? "pie" : "donut";
    const plan: QueryPlan = {
      operation: "groupby",
      title: `Distribution: ${catCols[0].name}`,
      groupBy: [catCols[0].name],
      agg: "count",
      limit: 8,
      explanation: `Record distribution across ${catCols[0].name} categories.`,
      chart: { type: chartType, x: catCols[0].name, y: "count" },
    };
    results.push(runQuery(dataset, plan));
  }

  // 4. Scatter: two numeric columns
  if (numCols.length >= 2) {
    const plan: QueryPlan = {
      operation: "raw",
      title: `${numCols[0].name} vs ${numCols[1].name}`,
      columns: [numCols[0].name, numCols[1].name],
      limit: 200,
      explanation: `Relationship between ${numCols[0].name} and ${numCols[1].name}.`,
      chart: { type: "scatter", x: numCols[0].name, y: numCols[1].name },
    };
    results.push(runQuery(dataset, plan));
  }

  // 5. Area chart for second numeric+time
  if (timeCols.length && numCols.length > 1) {
    const plan: QueryPlan = {
      operation: "timeseries",
      title: `${numCols[1].name} Trend`,
      timeColumn: timeCols[0].name,
      metric: numCols[1].name,
      agg: "mean",
      explanation: `Average ${numCols[1].name} over time.`,
      chart: { type: "area", x: timeCols[0].name, y: numCols[1].name },
    };
    results.push(runQuery(dataset, plan));
  }

  // 6. Second bar if we have more categoricals
  if (catCols.length > 1 && numCols.length > 1) {
    const plan: QueryPlan = {
      operation: "groupby",
      title: `${numCols[1].name} by ${catCols[1].name}`,
      groupBy: [catCols[1].name],
      metric: numCols[1].name,
      agg: "mean",
      limit: 12,
      explanation: `Average ${numCols[1].name} by ${catCols[1].name}.`,
      chart: { type: "bar", x: catCols[1].name, y: numCols[1].name },
    };
    results.push(runQuery(dataset, plan));
  }

  // 7. Histogram for first numeric
  if (numCols.length > 0) {
    const plan: QueryPlan = {
      operation: "histogram",
      title: `Distribution: ${numCols[0].name}`,
      metric: numCols[0].name,
      explanation: `Frequency distribution of ${numCols[0].name} values.`,
    };
    results.push(runQuery(dataset, plan));
  }

  return results;
}
