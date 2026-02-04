import { NextResponse } from "next/server";
import { TextAdventureOutlineSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/gemini";
import { buildTextAdventureOutlinePrompt } from "@/lib/prompts";
import { createGameRecord, loadGameRecord, saveGameRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function envOr(name: string, fallback: string) {
  return process.env[name] && process.env[name]!.trim().length > 0
    ? process.env[name]!.trim()
    : fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body?.prompt ?? "").trim();
    const language = body?.language === "en" ? "en" : "zh";
    const textModel = String(body?.textModel ?? envOr("GEMINI_TEXT_MODEL", "gemini-3-flash-preview"));
    const imageModel = String(body?.imageModel ?? envOr("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"));

    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });
    }

    let record = null;
    if (body?.gameId) {
      record = await loadGameRecord(String(body.gameId));
    }
    if (!record) {
      record = await createGameRecord({ mode: "text-adventure", prompt, language, textModel, imageModel });
    }

    const outline = await generateStructured({
      model: textModel,
      prompt: buildTextAdventureOutlinePrompt({ language, userPrompt: prompt }),
      schema: TextAdventureOutlineSchema,
    });

    const saved = await saveGameRecord(record.id, {
      prompt,
      language,
      textModel,
      imageModel,
      outline,
    });

    return NextResponse.json({ ok: true, gameId: saved?.id ?? record.id, outline });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
