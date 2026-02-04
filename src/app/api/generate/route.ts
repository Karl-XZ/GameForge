import { NextResponse } from "next/server";
import { TextAdventureOutlineSchema, TextAdventureScenesSchema, SideScrollerPlanSchema } from "@/lib/schemas";
import { generateStructured, generateImage, generateText } from "@/lib/gemini";
import {
  buildTextAdventureOutlinePrompt,
  buildTextAdventureScenesPrompt,
  buildSideScrollerPlanPrompt,
  buildSideScrollerGameHtmlPrompt,
  buildCoverPromptFromOutline,
} from "@/lib/prompts";
import { createGameRecord, saveGameRecord, saveAssetFile } from "@/lib/store";
import { slugify } from "@/lib/utils";
import { removeGreenScreen } from "@/lib/image";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// If your Vercel plan supports it, this allows longer-running generations.
export const maxDuration = 60;

type GenAsset = {
  id: string;
  type: string;
  needsCutout: boolean;
  prompt: string;
  file: string;
  // If present, this id is a "base" alias that should point to the same file as aliasOf.
  aliasOf?: string;
};

const CHARACTER_VARIANTS: Array<{ action: "idle" | "run" | "attack"; dir: "left" | "right" }> = [
  { action: "idle", dir: "right" },
  { action: "idle", dir: "left" },
  { action: "run", dir: "right" },
  { action: "run", dir: "left" },
  { action: "attack", dir: "right" },
  { action: "attack", dir: "left" },
];

function safeSlug(value: string) {
  const base = slugify(value);
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
  // slugify() turns non-latin ids into "item". Always append a hash to avoid collisions.
  if (!base || base === "item") return `id-${hash}`;
  return `${base}-${hash}`;
}

function buildVariantPrompt(basePrompt: string, action: string, dir: string) {
  // Keep the user's artistic intent but force a clear pose and direction.
  // We keep it short to reduce prompt drift.
  return `${basePrompt}. Same character, same outfit and art style. ${action} pose, facing ${dir}. Full body, centered, consistent scale, no text, no watermark.`;
}

function envOr(name: string, fallback: string) {
  return process.env[name] && process.env[name]!.trim().length > 0
    ? process.env[name]!.trim()
    : fallback;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const mode = String(form.get("mode") ?? "");
    const language = String(form.get("language") ?? "zh");
    const prompt = String(form.get("prompt") ?? "").trim();
    const textModel = String(form.get("textModel") ?? envOr("GEMINI_TEXT_MODEL", "gemini-3-flash-preview"));
    const imageModel = String(form.get("imageModel") ?? envOr("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"));

    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });
    }

    // Optional image input (multimodal).
    let image: { mimeType: string; data: string } | undefined;
    const file = form.get("image");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      const ab = await f.arrayBuffer();
      const b64 = Buffer.from(ab).toString("base64");
      image = { mimeType: f.type || "image/png", data: b64 };
    }

    if (mode === "text-adventure") {
      const record = await createGameRecord({ mode: "text-adventure", prompt, language: language === "en" ? "en" : "zh", textModel, imageModel });
      const outline = await generateStructured({
        model: textModel,
        prompt: buildTextAdventureOutlinePrompt({ language: language === "en" ? "en" : "zh", userPrompt: prompt }),
        schema: TextAdventureOutlineSchema,
      });
      const scenes = await generateStructured({
        model: textModel,
        prompt: buildTextAdventureScenesPrompt({ outline }),
        schema: TextAdventureScenesSchema,
      });
      const sceneFiles: Record<string, string> = {};
      for (const scene of scenes.scenes ?? []) {
        const id = String(scene?.id ?? "scene");
        const img = await generateImage({ model: imageModel, prompt: String(scene?.cgPrompt ?? "") });
        const file = `scene-${slugify(id)}.png`;
        await saveAssetFile(record.id, file, Buffer.from(img.data, "base64"));
        sceneFiles[id] = file;
      }
      const coverPrompt = buildCoverPromptFromOutline(outline);
      const coverImg = await generateImage({ model: imageModel, prompt: coverPrompt });
      await saveAssetFile(record.id, "cover.png", Buffer.from(coverImg.data, "base64"));

      await saveGameRecord(record.id, {
        outline,
        scenes,
        images: { cover: "cover.png", scenes: sceneFiles },
        status: "ready",
      });

      return NextResponse.json({ ok: true, mode, gameId: record.id });
    }

    if (mode === "side-scroller") {
      const record = await createGameRecord({ mode: "side-scroller", prompt, language: language === "en" ? "en" : "zh", textModel, imageModel });
      const planRaw = await generateStructured({
        model: textModel,
        prompt: buildSideScrollerPlanPrompt({ language: language === "en" ? "en" : "zh", userPrompt: prompt }),
        schema: SideScrollerPlanSchema,
      });

      const used = new Set<string>();
      const assets = (planRaw.assets ?? []).map((asset: any, idx: number) => {
        let id = String(asset?.id ?? `asset-${idx + 1}`).trim();
        if (!id) id = `asset-${idx + 1}`;
        let unique = id;
        let n = 1;
        while (used.has(unique)) unique = `${id}-${n++}`;
        used.add(unique);
        return { ...asset, id: unique };
      });
      const plan = { ...planRaw, assets };
      // Expand character assets into action+direction variants (idle/run/attack × left/right).
      // This keeps the design plan simple (one prompt per character) while ensuring the generated
      // game has distinct sprites for common actions.
      const assetMeta: Record<string, { type: string; needsCutout: boolean; file: string }> = {};
      const genAssets: GenAsset[] = [];
      for (const asset of assets) {
        const id = String(asset.id ?? "").trim();
        if (!id) continue;
        const type = String(asset.type ?? "other");
        const needsCutout = !!asset.needsCutout;
        const basePrompt = String(asset.prompt ?? "").trim();
        const isCharacter = type === "player" || type === "enemy" || type === "npc";

        if (isCharacter && basePrompt) {
          // Base id is an alias to idle_right so older code can still find a "player" asset.
          const idleRightId = `${id}__idle_right`;
          const idleRightFile = `asset-${safeSlug(idleRightId)}.png`;
          assetMeta[id] = { type, needsCutout, file: idleRightFile };

          for (const v of CHARACTER_VARIANTS) {
            const vid = `${id}__${v.action}_${v.dir}`;
            const vfile = `asset-${safeSlug(vid)}.png`;
            assetMeta[vid] = { type, needsCutout, file: vfile };
            genAssets.push({
              id: vid,
              type,
              needsCutout,
              prompt: buildVariantPrompt(basePrompt, v.action, v.dir),
              file: vfile,
            });
          }
          continue;
        }

        // Non-character assets are generated as single images.
        const file = `asset-${safeSlug(id)}.png`;
        assetMeta[id] = { type, needsCutout, file };
        if (basePrompt) {
          genAssets.push({ id, type, needsCutout, prompt: basePrompt, file });
        }
      }

      const assetFiles: Record<string, string> = {};
      for (const a of genAssets) {
        const promptText = a.needsCutout
          ? `${a.prompt}. Solid pure green background (#00FF00), centered subject, no shadows, no gradients.`
          : a.prompt;
        const img = await generateImage({ model: imageModel, prompt: promptText });
        let buffer: Buffer = Buffer.from(img.data, "base64");
        if (a.needsCutout) buffer = await removeGreenScreen(buffer as any);
        await saveAssetFile(record.id, a.file, buffer);
        assetFiles[a.id] = a.file;
      }
      // Ensure alias/base ids also appear in images mapping.
      for (const [id, meta] of Object.entries(assetMeta)) {
        if (!assetFiles[id]) assetFiles[id] = meta.file;
      }

      const assetList = Object.entries(assetMeta).map(([id, meta]) => ({ id, type: meta.type, file: meta.file }));
      const gameHtml = await generateText({
        model: textModel,
        prompt: buildSideScrollerGameHtmlPrompt({ plan, assets: assetList }),
      });

      await saveGameRecord(record.id, {
        plan,
        assetMeta,
        images: { assets: assetFiles },
        gameHtml,
        status: "ready",
      });

      return NextResponse.json({ ok: true, mode, gameId: record.id });
    }

    return NextResponse.json({ ok: false, error: "Unknown mode" }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
