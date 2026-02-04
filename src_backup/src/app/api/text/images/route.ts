import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { buildCoverPromptFromOutline } from "@/lib/prompts";
import { loadGameRecord, saveGameRecord, saveAssetFile } from "@/lib/store";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    const scenesDoc = body?.scenes ?? record.scenes;
    if (!scenesDoc) {
      return NextResponse.json({ ok: false, error: "Scenes are required" }, { status: 400 });
    }

    const scenes = Array.isArray(scenesDoc.scenes) ? scenesDoc.scenes : [];
    const sceneFiles: Record<string, string> = { ...(record.images?.scenes ?? {}) };

    for (const scene of scenes) {
      const id = String(scene?.id ?? "scene");
      const prompt = String(scene?.cgPrompt ?? "").trim();
      if (!prompt) continue;
      const img = await generateImage({ model: record.imageModel, prompt });
      const buffer = Buffer.from(img.data, "base64");
      const file = `scene-${slugify(id)}.png`;
      await saveAssetFile(gameId, file, buffer);
      sceneFiles[id] = file;
    }

    let coverFile = record.images?.cover;
    if (!coverFile && record.outline) {
      const coverPrompt = buildCoverPromptFromOutline(record.outline);
      const img = await generateImage({ model: record.imageModel, prompt: coverPrompt });
      const buffer = Buffer.from(img.data, "base64");
      coverFile = "cover.png";
      await saveAssetFile(gameId, coverFile, buffer);
    }

    const saved = await saveGameRecord(gameId, {
      scenes: scenesDoc,
      images: {
        ...(record.images ?? {}),
        cover: coverFile,
        scenes: sceneFiles,
      },
      status: "ready",
    });

    return NextResponse.json({
      ok: true,
      gameId: saved?.id ?? gameId,
      images: { cover: coverFile, scenes: sceneFiles },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
