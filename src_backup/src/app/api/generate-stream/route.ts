import { TextAdventureOutlineSchema, TextAdventureScenesSchema, SideScrollerPlanSchema } from "@/lib/schemas";
import { generateStructured, generateImage, generateText } from "@/lib/gemini";
import {
  buildTextAdventureOutlinePrompt,
  buildTextAdventureScenesPrompt,
  buildSideScrollerPlanPrompt,
  buildSideScrollerGameHtmlPrompt,
  buildCoverPromptFromOutline,
} from "@/lib/prompts";
import { createGameRecord, loadGameRecord, saveGameRecord, saveAssetFile } from "@/lib/store";
import { slugify } from "@/lib/utils";
import { removeGreenScreen } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

type Mode = "text-adventure" | "side-scroller";

function envOr(name: string, fallback: string) {
  return process.env[name] && process.env[name]!.trim().length > 0
    ? process.env[name]!.trim()
    : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function withGreenScreen(prompt: string) {
  return `${prompt}. Solid pure green background (#00FF00), centered subject, no shadows, no gradients.`;
}

export async function POST(req: Request) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const send = async (evt: any) => {
    await writer.write(enc.encode(JSON.stringify(evt) + "\n"));
  };

  const safeClose = async () => {
    try {
      await writer.close();
    } catch {
      // ignore
    }
  };

  (async () => {
    try {
      const form = await req.formData();
      const mode = String(form.get("mode") ?? "") as Mode;
      const language = String(form.get("language") ?? "zh") === "en" ? "en" : "zh";
      const prompt = String(form.get("prompt") ?? "").trim();
      const textModel = String(form.get("textModel") ?? envOr("GEMINI_TEXT_MODEL", "gemini-3-flash-preview"));
      const imageModel = String(form.get("imageModel") ?? envOr("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"));

      if (!prompt) {
        await send({ type: "fatal", ts: nowIso(), error: "Prompt is required" });
        return;
      }

      const steps =
        mode === "text-adventure"
          ? [
              { id: "outline", title: "剧情大纲" },
              { id: "scenes", title: "分幕 JSON" },
              { id: "images", title: "逐幕出图" },
              { id: "finalize", title: "完成" },
            ]
          : [
              { id: "plan", title: "素材清单" },
              { id: "images", title: "素材出图" },
              { id: "game", title: "生成游戏" },
              { id: "finalize", title: "完成" },
            ];

      await send({ type: "init", ts: nowIso(), mode, steps });

      const existingId = String(form.get("gameId") ?? "").trim();
      let record = existingId ? await loadGameRecord(existingId) : null;
      if (!record || record.mode !== mode) {
        record = await createGameRecord({ mode, prompt, language, textModel, imageModel });
      }
      await send({ type: "log", ts: nowIso(), level: "info", message: `gameId=${record.id}` });
      const metrics: Record<string, { startedAt: string; endedAt?: string; durationMs?: number }> = {
        ...(record.metrics ?? {}),
      };
      const startTimes = new Map<string, number>();
      const markStart = async (step: string) => {
        startTimes.set(step, Date.now());
        metrics[step] = { startedAt: nowIso() };
        await saveGameRecord(record.id, { metrics });
      };
      const markEnd = async (step: string) => {
        const started = startTimes.get(step) ?? Date.now();
        metrics[step] = {
          ...(metrics[step] ?? { startedAt: nowIso() }),
          endedAt: nowIso(),
          durationMs: Math.max(0, Date.now() - started),
        };
        await saveGameRecord(record.id, { metrics });
      };

      if (mode === "text-adventure") {
        let outline = record.outline;
        if (!outline) {
          await send({ type: "step", ts: nowIso(), id: "outline", status: "running" satisfies StepStatus, percent: 10, message: "生成剧情大纲" });
          await markStart("outline");
          outline = await generateStructured({
            model: textModel,
            prompt: buildTextAdventureOutlinePrompt({ language, userPrompt: prompt }),
            schema: TextAdventureOutlineSchema,
          });
          await saveGameRecord(record.id, { outline });
          await markEnd("outline");
          await send({ type: "step", ts: nowIso(), id: "outline", status: "done" satisfies StepStatus, percent: 20, message: "大纲完成" });
        } else {
          await send({ type: "step", ts: nowIso(), id: "outline", status: "skipped" satisfies StepStatus, percent: 20, message: "已存在" });
        }

        let scenes = record.scenes;
        if (!scenes) {
          await send({ type: "step", ts: nowIso(), id: "scenes", status: "running" satisfies StepStatus, percent: 30, message: "生成分幕 JSON" });
          await markStart("scenes");
          scenes = await generateStructured({
            model: textModel,
            prompt: buildTextAdventureScenesPrompt({ outline }),
            schema: TextAdventureScenesSchema,
          });
          await saveGameRecord(record.id, { scenes });
          await markEnd("scenes");
          await send({ type: "step", ts: nowIso(), id: "scenes", status: "done" satisfies StepStatus, percent: 55, message: "分幕完成" });
        } else {
          await send({ type: "step", ts: nowIso(), id: "scenes", status: "skipped" satisfies StepStatus, percent: 55, message: "已存在" });
        }

        await send({ type: "step", ts: nowIso(), id: "images", status: "running" satisfies StepStatus, percent: 65, message: "逐幕出图" });
        await markStart("images");
        const sceneFiles: Record<string, string> = { ...(record.images?.scenes ?? {}) };
        const list = Array.isArray(scenes.scenes) ? scenes.scenes : [];
        for (const scene of list) {
          const id = String(scene?.id ?? "scene");
          if (sceneFiles[id]) continue;
          const prompt = String(scene?.cgPrompt ?? "").trim();
          if (!prompt) continue;
          const img = await generateImage({ model: imageModel, prompt });
          const buffer = Buffer.from(img.data, "base64");
          const file = `scene-${slugify(id)}.png`;
          await saveAssetFile(record.id, file, buffer);
          await saveGameRecord(record.id, {
            images: { ...(record.images ?? {}), scenes: { ...sceneFiles, [id]: file } },
          });
          sceneFiles[id] = file;
        }

        let cover = record.images?.cover;
        if (!cover) {
          const coverPrompt = buildCoverPromptFromOutline(outline);
          const coverImg = await generateImage({ model: imageModel, prompt: coverPrompt });
          await saveAssetFile(record.id, "cover.png", Buffer.from(coverImg.data, "base64"));
          cover = "cover.png";
        }

        await saveGameRecord(record.id, {
          images: { ...(record.images ?? {}), scenes: sceneFiles, cover },
          status: "ready",
        });
        await markEnd("images");

        await send({ type: "step", ts: nowIso(), id: "images", status: "done" satisfies StepStatus, percent: 90, message: "图片完成" });
        await send({ type: "step", ts: nowIso(), id: "finalize", status: "done" satisfies StepStatus, percent: 100, message: "完成" });
        await send({ type: "result", ts: nowIso(), result: { ok: true, mode, gameId: record.id } });
        return;
      }

      if (mode === "side-scroller") {
        let plan = record.plan;
        let assetMeta = record.assetMeta ?? {};
        if (!plan) {
          await send({ type: "step", ts: nowIso(), id: "plan", status: "running" satisfies StepStatus, percent: 10, message: "生成素材清单" });
          await markStart("plan");
          const planRaw = await generateStructured({
            model: textModel,
            prompt: buildSideScrollerPlanPrompt({ language, userPrompt: prompt }),
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

          plan = { ...planRaw, assets };
          assetMeta = {};
          for (const asset of assets) {
            assetMeta[asset.id] = {
              type: String(asset.type ?? "other"),
              needsCutout: !!asset.needsCutout,
              file: `asset-${slugify(asset.id)}.png`,
            };
          }

          await saveGameRecord(record.id, { plan, assetMeta });
          await markEnd("plan");
          await send({ type: "step", ts: nowIso(), id: "plan", status: "done" satisfies StepStatus, percent: 35, message: "清单完成" });
        } else {
          await send({ type: "step", ts: nowIso(), id: "plan", status: "skipped" satisfies StepStatus, percent: 35, message: "已存在" });
        }

        await send({ type: "step", ts: nowIso(), id: "images", status: "running" satisfies StepStatus, percent: 50, message: "生成素材图" });
        await markStart("images");
        const assetFiles: Record<string, string> = { ...(record.images?.assets ?? {}) };
        const assets = (plan?.assets ?? []) as any[];
        for (const asset of assets) {
          const meta = assetMeta[asset.id];
          if (!meta) continue;
          if (assetFiles[asset.id]) continue;
          const prompt = meta.needsCutout ? withGreenScreen(String(asset.prompt ?? "")) : String(asset.prompt ?? "");
          if (!prompt.trim()) continue;
          const img = await generateImage({ model: imageModel, prompt });
          let buffer: Buffer = Buffer.from(img.data, "base64");
          if (meta.needsCutout) buffer = await removeGreenScreen(buffer as any);
          await saveAssetFile(record.id, meta.file, buffer);
          assetFiles[asset.id] = meta.file;
        }
        await saveGameRecord(record.id, { images: { ...(record.images ?? {}), assets: assetFiles } });
        await markEnd("images");
        await send({ type: "step", ts: nowIso(), id: "images", status: "done" satisfies StepStatus, percent: 75, message: "素材完成" });

        if (!record.gameHtml) {
          await send({ type: "step", ts: nowIso(), id: "game", status: "running" satisfies StepStatus, percent: 85, message: "生成游戏 HTML" });
          await markStart("game");
          const assetList = Object.entries(assetMeta).map(([id, meta]) => ({ id, type: meta.type, file: meta.file }));
          const html = await generateText({
            model: textModel,
            prompt: buildSideScrollerGameHtmlPrompt({ plan, assets: assetList }),
          });
          await saveGameRecord(record.id, { gameHtml: html, status: "ready" });
          await markEnd("game");
          await send({ type: "step", ts: nowIso(), id: "game", status: "done" satisfies StepStatus, percent: 95, message: "游戏完成" });
        } else {
          await send({ type: "step", ts: nowIso(), id: "game", status: "skipped" satisfies StepStatus, percent: 95, message: "已存在" });
        }
        await send({ type: "step", ts: nowIso(), id: "finalize", status: "done" satisfies StepStatus, percent: 100, message: "完成" });
        await send({ type: "result", ts: nowIso(), result: { ok: true, mode, gameId: record.id } });
        return;
      }

      await send({ type: "fatal", ts: nowIso(), error: "Unknown mode" });
    } catch (err: any) {
      console.error(err);
      await send({ type: "fatal", ts: nowIso(), error: err?.message ?? String(err) });
    } finally {
      await safeClose();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
