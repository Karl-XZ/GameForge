import { NextResponse } from "next/server";
import { SideScrollerPlanSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/gemini";
import { buildSideScrollerPlanPrompt } from "@/lib/prompts";
import { createGameRecord, loadGameRecord, saveGameRecord } from "@/lib/store";
import { slugify } from "@/lib/utils";
import { sanitizeAssetPrompt } from "@/lib/imagePrompt";
import { injectFrontAssets } from "@/lib/characterVariants";

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
      record = await createGameRecord({ mode: "side-scroller", prompt, language, textModel, imageModel });
    }

    const planRaw = await generateStructured({
      model: textModel,
      prompt: buildSideScrollerPlanPrompt({ language, userPrompt: prompt }),
      schema: SideScrollerPlanSchema,
    });

    const used = new Set<string>();
    const assets0 = (planRaw.assets ?? []).map((asset: any, idx: number) => {
      let id = String(asset?.id ?? `asset-${idx + 1}`).trim();
      if (!id) id = `asset-${idx + 1}`;
      let unique = id;
      let n = 1;
      while (used.has(unique)) {
        unique = `${id}-${n++}`;
      }
      used.add(unique);
      const prompt = sanitizeAssetPrompt({
        prompt: String(asset?.prompt ?? ""),
        assetId: unique,
        assetType: String(asset?.type ?? "other"),
        language,
      });
      return { ...asset, id: unique, prompt };
    });

    // Ensure every character with variants has a "__front" reference sprite.
    const injected = injectFrontAssets({ assets: assets0 as any, lang: language });
    const assets = injected.assets;

    const plan = { ...planRaw, assets };

    const assetMeta: Record<string, { type: string; needsCutout: boolean; file: string }> = {};
    for (const asset of assets) {
      const file = `asset-${slugify(asset.id)}.png`;
      assetMeta[asset.id] = {
        type: String(asset.type ?? "other"),
        needsCutout: !!asset.needsCutout,
        file,
      };
    }

    const saved = await saveGameRecord(record.id, {
      prompt,
      language,
      textModel,
      imageModel,
      plan,
      assetMeta,
    });

    return NextResponse.json({ ok: true, gameId: saved?.id ?? record.id, plan });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
