import { NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";
import { buildSideScrollerGameHtmlPrompt } from "@/lib/prompts";
import { loadGameRecord, saveGameRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const plan = record.plan;
    if (!plan) {
      return NextResponse.json({ ok: false, error: "Plan is required" }, { status: 400 });
    }

    const assets = Object.entries(record.assetMeta ?? {}).map(([id, meta]) => ({
      id,
      type: meta.type,
      file: meta.file,
    }));

    const html = await generateText({
      model: record.textModel,
      prompt: buildSideScrollerGameHtmlPrompt({ plan, assets }),
    });

    const saved = await saveGameRecord(gameId, { gameHtml: html, status: "ready" });
    return NextResponse.json({ ok: true, gameId: saved?.id ?? gameId, gameHtml: html });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
