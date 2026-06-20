"use client";
import { Table, Download } from "lucide-react";

interface DataTable {
  show: boolean;
  columns: string[];
  rows: any[][];
  title?: string;
}

interface AIDataTableProps {
  dataTable: DataTable;
}

export function AIDataTable({ dataTable }: AIDataTableProps) {
  const { columns, rows, title = "Data Results" } = dataTable;

  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return null;
  }

  const handleExportCSV = () => {
    try {
      const csvHeaders = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(",");
      const csvRows = rows.map(row => 
        row.map(val => {
          const stringVal = val === null || val === undefined ? "" : String(val);
          return `"${stringVal.replace(/"/g, '""')}"`;
        }).join(",")
      );
      
      const csvContent = "data:text/csv;charset=utf-8," + [csvHeaders, ...csvRows].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export CSV", err);
    }
  };

  return (
    <div className="w-full bg-[#0F0F1A] border border-[#2A2A4A]/50 rounded-2xl p-4 mt-3">
      {/* Title & Export */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[#AFA9EC] flex items-center gap-1.5">
          <Table className="w-3.5 h-3.5" />
          {title}
        </span>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-2 py-1 bg-secondary/40 hover:bg-secondary rounded-lg border border-border/40 hover:border-primary/40 text-[10px] text-muted-foreground hover:text-foreground transition-all duration-200"
          title="Export CSV"
        >
          <Download className="w-3 h-3" />
          Export CSV
        </button>
      </div>

      {/* Table Container */}
      <div className="overflow-auto max-h-[250px] rounded-xl border border-[#2A2A4A]/40 scrollbar-thin">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-[#0A0A14] z-10 border-b border-[#2A2A4A]/60">
            <tr>
              {columns.map((col) => (
                <th 
                  key={col} 
                  className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none bg-[#0A0A14]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr 
                key={i} 
                className="border-b border-[#2A2A4A]/20 hover:bg-primary/5 transition-colors duration-150"
                style={{ backgroundColor: i % 2 === 0 ? "#1A1A2E" : "#151523" }}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 font-medium text-foreground max-w-[200px] truncate">
                    {cell === null || cell === undefined ? (
                      <span className="text-muted-foreground/40 italic">—</span>
                    ) : typeof cell === "number" ? (
                      <span className="font-mono text-right block w-full">
                        {cell.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
