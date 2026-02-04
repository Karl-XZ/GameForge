import { NextResponse } from "next/server";
import { SideScrollerPlanSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/gemini";
import { loadGameRecord, saveGameRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const gameId = String(body?.gameId ?? "").trim();
    const instruction = String(body?.instruction ?? "").trim();
    if (!gameId || !instruction) {
      return NextResponse.json({ ok: false, error: "gameId and instruction are required" }, { status: 400 });
    }

    const record = await loadGameRecord(gameId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const plan = body?.plan ?? record.plan;
    if (!plan) {
      return NextResponse.json({ ok: false, error: "Plan not found. Generate Step 1 first." }, { status: 400 });
    }

    const language = (record.language === "en" ? "en" : "zh") as "en" | "zh";
    const model = String(body?.textModel ?? record.textModel ?? "").trim() || "gemini-3-flash-preview";

    const prompt =
      `You are editing an existing Side-Scroller game plan JSON.\n` +
      `Apply the user's instruction WITHOUT introducing new top-level fields.\n` +
      `If you add/remove assets, keep IDs unique and stable where possible.\n` +
      `Keep the same language (language=${language}).\n` +
      `Return ONLY the updated JSON (no markdown).\n\n` +
      `Current plan JSON:\n${JSON.stringify(plan, null, 2)}\n\n` +
      `User instruction:\n${instruction}`;

    const updated = await generateStructured({
      model,
      prompt,
      schema: SideScrollerPlanSchema,
    });

    const saved = await saveGameRecord(gameId, { plan: updated });
    return NextResponse.json({ ok: true, gameId, plan: updated, record: saved });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
