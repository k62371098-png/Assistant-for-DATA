import { NextRequest, NextResponse } from "next/server";
import { explainDataset, generateInsights } from "@/lib/ai/gateway";
import { generateRuleInsights } from "@/lib/data/insights";

export async function POST(req: NextRequest) {
  try {
    const { schema, sampleRows } = await req.json();
    if (!schema) {
      return NextResponse.json({ error: "schema is required" }, { status: 400 });
    }

    const schemaJson = JSON.stringify(schema);
    const sampleJson = JSON.stringify(sampleRows?.slice(0, 20) ?? []);

    // Run AI explanation and AI insights in parallel
    const [explanation, aiInsightsRaw] = await Promise.allSettled([
      explainDataset(schemaJson),
      generateInsights(schemaJson, sampleJson),
    ]);

    let aiInsights = [];
    if (aiInsightsRaw.status === "fulfilled") {
      try {
        aiInsights = JSON.parse(aiInsightsRaw.value);
      } catch {
        aiInsights = [];
      }
    }

    return NextResponse.json({
      explanation: explanation.status === "fulfilled" ? explanation.value : "Dataset loaded successfully.",
      aiInsights,
    });
  } catch (err) {
    console.error("[ai/insights]", err);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}
