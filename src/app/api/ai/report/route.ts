import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/ai/gateway";

export async function POST(req: NextRequest) {
  try {
    const { datasetName, schema, insights } = await req.json();
    if (!datasetName || !schema) {
      return NextResponse.json({ error: "datasetName and schema required" }, { status: 400 });
    }
    const reportJson = await generateReport(
      datasetName,
      JSON.stringify(schema),
      JSON.stringify(insights ?? [])
    );
    let reportData = {};
    try { reportData = JSON.parse(reportJson); } catch { reportData = { summary: reportJson }; }
    return NextResponse.json({ report: reportData });
  } catch (err) {
    console.error("[ai/report]", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
