import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { loadGameRecord, saveAssetFile, saveGameRecord } from "@/lib/store";
import { removeGreenScreen } from "@/lib/image";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function withGreenScreen(prompt: string) {
  return `${prompt}. Solid pure green background (#00FF00), centered subject, no shadows, no gradients.`;
}

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

    const plan = body?.plan ?? record.plan;
    const assets = Array.isArray(plan?.assets) ? plan.assets : [];
    let assetMeta = record.assetMeta ?? {};
    if (body?.plan) {
      assetMeta = {};
      for (const asset of assets) {
        const id = String(asset.id ?? "").trim() || `asset-${Object.keys(assetMeta).length + 1}`;
        assetMeta[id] = {
          type: String(asset.type ?? "other"),
          needsCutout: !!asset.needsCutout,
          file: `asset-${slugify(id)}.png`,
        };
      }
    }
    const assetFiles: Record<string, string> = { ...(record.images?.assets ?? {}) };

    for (const asset of assets) {
      const meta = assetMeta[asset.id];
      if (!meta) continue;
      const needsCutout = !!asset.needsCutout;
      const prompt = needsCutout ? withGreenScreen(String(asset.prompt ?? "")) : String(asset.prompt ?? "");
      if (!prompt.trim()) continue;

      const img = await generateImage({ model: record.imageModel, prompt });
      let buffer: Buffer = Buffer.from(img.data, "base64");
      if (needsCutout) {
        buffer = await removeGreenScreen(buffer as any);
      }

      await saveAssetFile(gameId, meta.file, buffer);
      assetFiles[asset.id] = meta.file;
    }

    const saved = await saveGameRecord(gameId, {
      plan,
      assetMeta,
      images: { ...(record.images ?? {}), assets: assetFiles },
    });

    return NextResponse.json({ ok: true, gameId: saved?.id ?? gameId, assets: assetFiles });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
