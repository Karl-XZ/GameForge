import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { loadGameRecord, saveGameRecord, saveAssetFile } from "@/lib/store";
import { slugify } from "@/lib/utils";
import { withRequestNonce } from "@/lib/imagePrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const gameId = String(body?.gameId ?? "");
    const sceneId = String(body?.sceneId ?? "");
    const cgPrompt = String(body?.cgPrompt ?? "").trim();
    const force = !!body?.force;
    if (!gameId || !sceneId || !cgPrompt) {
      return NextResponse.json({ ok: false, error: "gameId, sceneId, cgPrompt are required" }, { status: 400 });
    }

    const record = await loadGameRecord(gameId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const prompt = withRequestNonce(cgPrompt, force);
    const img = await generateImage({ model: record.imageModel, prompt });
    const buffer = Buffer.from(img.data, "base64");
    const file = `scene-${slugify(sceneId)}.png`;
    await saveAssetFile(gameId, file, buffer);

    const sceneFiles = { ...(record.images?.scenes ?? {}), [sceneId]: file };
    await saveGameRecord(gameId, {
      images: { ...(record.images ?? {}), scenes: sceneFiles },
    });

    return NextResponse.json({ ok: true, gameId, file });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
