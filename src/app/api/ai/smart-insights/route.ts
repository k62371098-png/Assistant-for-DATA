import { NextRequest, NextResponse } from "next/server";
import { aiGateway } from "@/lib/ai/gateway";

export async function POST(req: NextRequest) {
  try {
    const { columns, sampleRows, stats, datasetName } = await req.json();
    if (!columns) {
      return NextResponse.json({ error: "columns required" }, { status: 400 });
    }

    const systemPrompt = `You are a data analyst. Analyze this dataset and return ONLY a valid JSON array.
No markdown, no code blocks, no explanation. Raw JSON only.
Each object must have exactly these fields:
  title: string (specific, mention actual column names and values)
  tag: one of exactly: pattern, distribution, warning, opportunity
  description: string (2-3 sentences, specific numbers and column names)
  icon: one of: chart-bar, users, alert-triangle, map-pin, clock, phone, trending-up, percentage, list
Generate exactly 6 insights. Make them specific to the actual data provided.`;

    // Build a rich user message from dataset stats
    let userMsg = `Dataset: ${datasetName || "uploaded dataset"}\n`;
    userMsg += `Rows: ${stats?.rowCount || "unknown"}\n`;
    userMsg += `Columns: ${columns.map((c: any) => `${c.name} (${c.type})`).join(", ")}\n`;
    userMsg += `Stats per column:\n`;
    columns.forEach((c: any) => {
      let line = `  ${c.name} (${c.type}): nulls=${c.nullCount ?? 0}, unique=${c.uniqueCount ?? "?"}`;
      if (c.type === "number" && c.mean !== undefined) {
        line += `, min=${c.min}, max=${c.max}, mean=${typeof c.mean === "number" ? c.mean.toFixed(2) : c.mean}, std=${typeof c.std === "number" ? c.std.toFixed(2) : c.std}`;
      }
      userMsg += line + "\n";
    });
    if (sampleRows?.length) {
      userMsg += `\nSample rows (first 5): ${JSON.stringify(sampleRows.slice(0, 5))}`;
    }

    // Try Anthropic first (best for structured analysis)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [
              { role: "user", content: `${systemPrompt}\n\n${userMsg}` },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text ?? "[]";
          const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          
          const parsed = tryParseInsights(cleaned);
          if (parsed.length > 0) {
            return NextResponse.json({ insights: parsed });
          }
        } else {
          console.warn("[smart-insights] Anthropic returned", res.status, "— falling back to gateway");
        }
      } catch (err) {
        console.warn("[smart-insights] Anthropic failed:", err, "— falling back to gateway");
      }
    }

    // Fallback: Use the AI Gateway (OpenAI → Groq → Gemini cascade)
    console.log("[smart-insights] Using AI Gateway fallback...");
    try {
      const gatewayRes = await aiGateway({
        systemPrompt,
        userPrompt: userMsg + "\n\nReturn ONLY the JSON array:",
        expectJSON: true,
        maxTokens: 1500,
      });

      if (gatewayRes.provider !== "fallback") {
        const cleaned = gatewayRes.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        const parsed = tryParseInsights(cleaned);
        if (parsed.length > 0) {
          return NextResponse.json({ insights: parsed, provider: gatewayRes.provider });
        }
      }
    } catch (err) {
      console.warn("[smart-insights] Gateway fallback also failed:", err);
    }

    // All AI providers failed — return empty so frontend shows rule-based fallback
    return NextResponse.json({ insights: [], fallback: true });
  } catch (err) {
    console.error("[smart-insights]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

function tryParseInsights(text: string): any[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Try to find JSON array in the text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
  }
  return [];
}
