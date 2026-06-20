import { NextRequest, NextResponse } from "next/server";
import { interpretQuery } from "@/lib/ai/gateway";

export async function POST(req: NextRequest) {
  try {
    const { question, datasetContext, questionColumn, detectedType, history } = await req.json();
    if (!question || !datasetContext) {
      return NextResponse.json({ error: "question and datasetContext are required" }, { status: 400 });
    }
    const result = await interpretQuery(question, datasetContext, questionColumn ?? "", detectedType ?? "", history ?? []);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[chat/query]", err);
    return NextResponse.json(
      { error: "Failed to interpret query", details: String(err) },
      { status: 500 }
    );
  }
}
