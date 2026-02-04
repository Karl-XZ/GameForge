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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// If your Vercel plan supports it, this allows longer-running generations.
export const maxDuration = 60;

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
      const assetMeta: Record<string, { type: string; needsCutout: boolean; file: string }> = {};
      for (const asset of assets) {
        assetMeta[asset.id] = {
          type: String(asset.type ?? "other"),
          needsCutout: !!asset.needsCutout,
          file: `asset-${slugify(asset.id)}.png`,
        };
      }

      const assetFiles: Record<string, string> = {};
      for (const asset of assets) {
        const meta = assetMeta[asset.id];
        if (!meta) continue;
        const promptText = meta.needsCutout
          ? `${String(asset.prompt ?? "")}. Solid pure green background (#00FF00), centered subject, no shadows, no gradients.`
          : String(asset.prompt ?? "");
        const img = await generateImage({ model: imageModel, prompt: promptText });
        let buffer: Buffer = Buffer.from(img.data, "base64");
        if (meta.needsCutout) buffer = await removeGreenScreen(buffer as any);
        await saveAssetFile(record.id, meta.file, buffer);
        assetFiles[asset.id] = meta.file;
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
