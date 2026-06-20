import { NextRequest, NextResponse } from "next/server";
import { chatResponse } from "@/lib/ai/gateway";

export async function POST(req: NextRequest) {
  try {
    const { question, context, history } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    const answer = await chatResponse(question, context ?? "", history ?? []);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[chat/message]", err);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}
