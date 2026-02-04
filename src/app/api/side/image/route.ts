import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { loadGameRecord, readAssetFile, saveAssetFile, saveGameRecord } from "@/lib/store";
import { removeGreenScreen } from "@/lib/image";
import { sanitizeAssetPrompt, withRequestNonce } from "@/lib/imagePrompt";
import { slugify } from "@/lib/utils";
import {
  buildFrontReferencePrompt,
  buildVariantConsistencyAddon,
  frontIdFor,
  isCharacterAsset,
  isFrontId,
  isVariantId,
} from "@/lib/characterVariants";

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
    const force = !!body?.force;

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

    // Sanitize character prompts to avoid generating sprite-sheets / "差分" grids.
    const cleaned = sanitizeAssetPrompt({
      prompt: promptInput,
      assetId,
      assetType: meta.type,
      language: record.language,
    });

    // Character variants: generate / ensure a front reference first, then use image-to-image.
    const lang = record.language;
    const wantsRef = isCharacterAsset(meta.type) && isVariantId(assetId) && !isFrontId(assetId);
    let referenceImage: { mimeType: string; data: string } | undefined = undefined;
    if (wantsRef) {
      const frontId = frontIdFor(assetId);
      const recordAssetMeta = record.assetMeta ?? {};
      let frontMeta = recordAssetMeta[frontId];

      // If plan didn't include the front asset (edge cases / modified plan), create meta on the fly.
      if (!frontMeta) {
        const file = `asset-${slugify(frontId)}.png`;
        frontMeta = { type: meta.type, needsCutout, file } as any;
        recordAssetMeta[frontId] = frontMeta as any;
        await saveGameRecord(gameId, { assetMeta: recordAssetMeta });
      }

      let frontBuffer: Buffer | null = null;
      try {
        frontBuffer = await readAssetFile(gameId, frontMeta.file);
      } catch {
        frontBuffer = null;
      }

      // If no front reference exists yet, generate it first.
      if (!frontBuffer) {
        const frontPromptClean = sanitizeAssetPrompt({
          prompt: buildFrontReferencePrompt({ prompt: cleaned, lang }),
          assetId: frontId,
          assetType: meta.type,
          language: lang,
        });
        let frontPrompt = needsCutout ? withGreenScreen(frontPromptClean) : frontPromptClean;
        frontPrompt = withRequestNonce(frontPrompt, true);
        const frontImg = await generateImage({ model: record.imageModel, prompt: frontPrompt });
        let buf: Buffer = Buffer.from(frontImg.data, "base64");
        if (needsCutout) {
          buf = await removeGreenScreen(buf as any);
        }
        await saveAssetFile(gameId, frontMeta.file, buf);
        const nextAssets = { ...(record.images?.assets ?? {}), [frontId]: frontMeta.file };
        await saveGameRecord(gameId, { images: { ...(record.images ?? {}), assets: nextAssets } });
        frontBuffer = buf;
      }

      referenceImage = { mimeType: "image/png", data: frontBuffer.toString("base64") };
    }

    let prompt = needsCutout ? withGreenScreen(cleaned) : cleaned;

    // If we are doing image-to-image for a character variant, enforce consistency via prompt add-on.
    if (referenceImage) {
      const fid = frontIdFor(assetId);
      prompt = `${prompt}${buildVariantConsistencyAddon({ assetId, frontId: fid, lang })}`;
    }
    // Add nonce when the caller explicitly asks to regenerate.
    prompt = withRequestNonce(prompt, force);

    let img;
    try {
      img = await generateImage({ model: record.imageModel, prompt, image: referenceImage });
    } catch (e) {
      // Fallback: if the model/account doesn't support image-to-image, fall back to text-to-image.
      img = await generateImage({ model: record.imageModel, prompt });
    }
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
