import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { loadGameRecord, readAssetFile, saveAssetFile, saveGameRecord } from "@/lib/store";
import { removeGreenScreen } from "@/lib/image";
import { slugify } from "@/lib/utils";
import { sanitizeAssetPrompt, withRequestNonce } from "@/lib/imagePrompt";
import {
  buildFrontReferencePrompt,
  buildVariantConsistencyAddon,
  frontIdFor,
  injectFrontAssets,
  isCharacterAsset,
  isFrontId,
  isVariantId,
} from "@/lib/characterVariants";

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
    const force = !!body?.force;
    if (!gameId) {
      return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
    }

    const record = await loadGameRecord(gameId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const plan = body?.plan ?? record.plan;
    const assets = Array.isArray(plan?.assets) ? plan.assets : [];
    // Persist sanitized prompts so re-generations won't accidentally re-introduce sprite-sheet wording.
    const sanitizedAssets0 = assets.map((asset: any) => ({
      ...asset,
      prompt: sanitizeAssetPrompt({
        prompt: String(asset?.prompt ?? ""),
        assetId: String(asset?.id ?? ""),
        assetType: String(asset?.type ?? "other"),
        language: record.language,
      }),
    }));

    // Ensure front reference sprites exist in the plan.
    const injected = injectFrontAssets({ assets: sanitizedAssets0 as any, lang: record.language });
    const sanitizedAssets = injected.assets;
    const planToSave = Array.isArray(plan?.assets) ? { ...plan, assets: sanitizedAssets } : plan;
    let assetMeta = record.assetMeta ?? {};
    if (body?.plan) {
      assetMeta = {};
      for (const asset of sanitizedAssets) {
        const id = String(asset.id ?? "").trim() || `asset-${Object.keys(assetMeta).length + 1}`;
        assetMeta[id] = {
          type: String(asset.type ?? "other"),
          needsCutout: !!asset.needsCutout,
          file: `asset-${slugify(id)}.png`,
        };
      }
    } else {
      // If we injected new front assets, ensure assetMeta has entries for them.
      for (const asset of sanitizedAssets) {
        if (!assetMeta[asset.id]) {
          assetMeta[asset.id] = {
            type: String(asset.type ?? "other"),
            needsCutout: !!asset.needsCutout,
            file: `asset-${slugify(asset.id)}.png`,
          };
        }
      }
    }
    const assetFiles: Record<string, string> = { ...(record.images?.assets ?? {}) };

    // Generation order: ensure each character's "__front" is generated before its variants.
    const assetsInOrder: any[] = [];
    const pushed = new Set<string>();
    const byId = new Map<string, any>();
    for (const a of sanitizedAssets) byId.set(String(a.id), a);
    for (const asset of sanitizedAssets) {
      const id = String(asset.id);
      if (isVariantId(id) && isCharacterAsset(String(asset.type ?? ""))) {
        const fid = frontIdFor(id);
        const front = byId.get(fid);
        if (front && !pushed.has(fid)) {
          assetsInOrder.push(front);
          pushed.add(fid);
        }
      }
      if (!pushed.has(id)) {
        assetsInOrder.push(asset);
        pushed.add(id);
      }
    }

    const refCache = new Map<string, Buffer>();

    for (const asset of assetsInOrder) {
      const meta = assetMeta[asset.id];
      if (!meta) continue;
      const needsCutout = !!asset.needsCutout;
      const cleaned = String(asset.prompt ?? "");
      let prompt = needsCutout ? withGreenScreen(cleaned) : cleaned;

      // If this is a character variant, attach consistency instructions and use the front reference as img2img input.
      let referenceImage: { mimeType: string; data: string } | undefined = undefined;
      const isChar = isCharacterAsset(String(asset.type ?? ""));
      const id = String(asset.id);
      if (isChar && isVariantId(id) && !isFrontId(id)) {
        const fid = frontIdFor(id);
        const fmeta = assetMeta[fid];
        if (fmeta) {
          let fbuf = refCache.get(fid) ?? null;
          if (!fbuf) {
            try {
              fbuf = await readAssetFile(gameId, fmeta.file);
            } catch {
              fbuf = null;
            }
          }
          // If the front image hasn't been generated yet (or was deleted), generate it now.
          if (!fbuf) {
            const frontAsset = byId.get(fid);
            const basePrompt = frontAsset?.prompt
              ? String(frontAsset.prompt)
              : buildFrontReferencePrompt({ prompt: cleaned, lang: record.language });
            const frontClean = sanitizeAssetPrompt({
              prompt: basePrompt,
              assetId: fid,
              assetType: String(asset.type ?? "player"),
              language: record.language,
            });
            let frontPrompt = needsCutout ? withGreenScreen(frontClean) : frontClean;
            frontPrompt = withRequestNonce(frontPrompt, true);
            const frontImg = await generateImage({ model: record.imageModel, prompt: frontPrompt });
            let fb: Buffer = Buffer.from(frontImg.data, "base64");
            if (needsCutout) fb = await removeGreenScreen(fb as any);
            await saveAssetFile(gameId, fmeta.file, fb);
            assetFiles[fid] = fmeta.file;
            fbuf = fb;
          }
          if (fbuf) {
            refCache.set(fid, fbuf);
            referenceImage = { mimeType: "image/png", data: fbuf.toString("base64") };
            prompt = `${prompt}${buildVariantConsistencyAddon({ assetId: id, frontId: fid, lang: record.language })}`;
          }
        }
      }

      prompt = withRequestNonce(prompt, force);
      if (!prompt.trim()) continue;

      let img;
      try {
        img = await generateImage({ model: record.imageModel, prompt, image: referenceImage });
      } catch {
        img = await generateImage({ model: record.imageModel, prompt });
      }
      let buffer: Buffer = Buffer.from(img.data, "base64");
      if (needsCutout) {
        buffer = await removeGreenScreen(buffer as any);
      }

      await saveAssetFile(gameId, meta.file, buffer);
      assetFiles[asset.id] = meta.file;

      // Cache fronts so subsequent variants can reuse without extra FS reads.
      if (isChar && isFrontId(String(asset.id))) {
        refCache.set(String(asset.id), buffer);
      }
    }

    const saved = await saveGameRecord(gameId, {
      plan: planToSave,
      assetMeta,
      images: { ...(record.images ?? {}), assets: assetFiles },
    });

    return NextResponse.json({ ok: true, gameId: saved?.id ?? gameId, assets: assetFiles });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
