import { NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";
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

    const currentHtml = String(body?.gameHtml ?? record.gameHtml ?? "");
    if (!currentHtml.trim()) {
      return NextResponse.json({ ok: false, error: "Game HTML not found. Generate Step 3 first." }, { status: 400 });
    }

    const language = (record.language === "en" ? "en" : "zh") as "en" | "zh";
    const model = String(body?.textModel ?? record.textModel ?? "").trim() || "gemini-3-flash-preview";

    // Keep the asset path convention stable so export/preview can rewrite it.
    const prompt =
      `You are editing a single-file HTML5 side-scrolling action game prototype.\n` +
      `Task: Apply the user's instruction to the HTML/JS/CSS while keeping it playable.\n` +
      `Rules:\n` +
      `- Output ONLY the full updated HTML document (no markdown).\n` +
      `- Keep all game assets referenced as relative paths under the \"assets/\" folder (e.g. assets/hero.png).\n` +
      `- Do NOT invent new asset filenames that do not exist; reuse existing ones in the current HTML.\n` +
      `- Keep language=${language} for UI text.\n\n` +
      `User instruction:\n${instruction}\n\n` +
      `Current HTML:\n${currentHtml}`;

    const updated = await generateText({ model, prompt });
    const cleaned = updated.trim();
    if (!cleaned.toLowerCase().includes("<html")) {
      return NextResponse.json({ ok: false, error: "Model did not return a full HTML document." }, { status: 500 });
    }

    const saved = await saveGameRecord(gameId, { gameHtml: cleaned });
    return NextResponse.json({ ok: true, gameId, gameHtml: cleaned, record: saved });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
