import { NextResponse } from "next/server";
import { TextAdventureScenesSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/gemini";
import { buildTextAdventureScenesPrompt } from "@/lib/prompts";
import { loadGameRecord, saveGameRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const gameId = String(body?.gameId ?? "");
    if (!gameId) {
      return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
    }
    const record = await loadGameRecord(gameId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const outline = body?.outline ?? record.outline;
    if (!outline) {
      return NextResponse.json({ ok: false, error: "Outline is required" }, { status: 400 });
    }

    const scenes = await generateStructured({
      model: record.textModel,
      prompt: buildTextAdventureScenesPrompt({ outline }),
      schema: TextAdventureScenesSchema,
    });

    const saved = await saveGameRecord(gameId, { scenes });

    return NextResponse.json({ ok: true, gameId: saved?.id ?? gameId, scenes });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
