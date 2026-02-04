import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { loadGameRecord, saveAssetFile, saveGameRecord } from "@/lib/store";
import { removeGreenScreen } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function withGreenScreen(prompt: string) {
  return `${prompt}. Solid pure green background (#00FF00), centered subject, no shadows, no gradients.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const gameId = String(body?.gameId ?? "");
    const assetId = String(body?.assetId ?? "");
    const promptInput = String(body?.prompt ?? "").trim();
    const needsCutout = !!body?.needsCutout;

    if (!gameId || !assetId || !promptInput) {
      return NextResponse.json({ ok: false, error: "gameId, assetId, prompt are required" }, { status: 400 });
    }

    const record = await loadGameRecord(gameId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const meta = record.assetMeta?.[assetId];
    if (!meta) {
      return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
    }

    const prompt = needsCutout ? withGreenScreen(promptInput) : promptInput;
    const img = await generateImage({ model: record.imageModel, prompt });
    let buffer: Buffer = Buffer.from(img.data, "base64");
    if (needsCutout) {
      buffer = await removeGreenScreen(buffer as any);
    }

    await saveAssetFile(gameId, meta.file, buffer);
    const assetFiles = { ...(record.images?.assets ?? {}), [assetId]: meta.file };
    await saveGameRecord(gameId, { images: { ...(record.images ?? {}), assets: assetFiles } });

    return NextResponse.json({ ok: true, gameId, file: meta.file });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
