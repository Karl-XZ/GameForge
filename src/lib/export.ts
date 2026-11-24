import JSZip from "jszip";
import { readAssetFile } from "@/lib/store";
import type { GameRecord } from "@/lib/store";
import { readVersionAsset, digest, type GameVersion } from './versions';

function escapeJson(data: any) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function normalizeAssetBase(assetBase?: string) {
  const base = assetBase && assetBase.trim().length > 0 ? assetBase.trim() : "assets/";
  return base.endsWith("/") ? base : `${base}/`;
}

function rewriteAssetPaths(html: string, assetBase: string) {
  const base = normalizeAssetBase(assetBase);
  return html
    .replace(/(src|href)=["'](?:\.\/)?assets\//g, `$1="${base}`)
    .replace(/url\((["']?)(?:\.\/)?assets\//g, `url($1${base}`)
    .replace(/(["'`])(?:\.\/)?assets\//g, `$1${base}`);
}

export function buildTextAdventureGameData(record: GameRecord, assetBase?: string) {
  const base = normalizeAssetBase(assetBase);
  const scenesDoc = record.scenes ?? {};
  const sceneImages = record.images?.scenes ?? {};
  const scenes = Array.isArray(scenesDoc.scenes) ? scenesDoc.scenes : [];
  const mapped = scenes.map((s: any) => ({
    ...s,
    image: sceneImages[String(s.id)] ? `${base}${sceneImages[String(s.id)]}` : null,
  }));
  return {
    language: record.language,
    title: scenesDoc.title ?? record.outline?.title ?? "",
    setting: scenesDoc.setting ?? record.outline?.setting ?? "",
    tone: scenesDoc.tone ?? record.outline?.tone ?? "",
    startingSceneId: scenesDoc.startingSceneId ?? mapped?.[0]?.id ?? "",
    scenes: mapped,
  };
}

export function buildTextAdventureHtml(record: GameRecord, assetBase?: string) {
  const data = buildTextAdventureGameData(record, assetBase);
  const dataJson = escapeJson(data);

  return `<!DOCTYPE html>
<html lang="${record.language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.title || "Text Adventure"}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #0b0f17; color: #e2e8f0; }
    .container { max-width: 980px; margin: 0 auto; padding: 24px; }
    .title { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 18px; }
    .card { background: #0f172a; border: 1px solid #1f2937; border-radius: 16px; padding: 18px; margin-bottom: 16px; }
    .scene-img { width: 100%; border-radius: 12px; margin-bottom: 12px; border: 1px solid #1f2937; }
    .choices { display: grid; gap: 8px; }
    .choice-btn { padding: 10px 14px; border-radius: 12px; border: 1px solid #334155; background: #111827; color: #e2e8f0; cursor: pointer; text-align: left; }
    .choice-btn:hover { background: #1f2937; }
    .ending { color: #e2e8f0; background: #0b1220; border: 1px solid #334155; border-radius: 12px; padding: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="game-title"></div>
    <div class="subtitle" id="game-subtitle"></div>
    <div class="card" id="scene-card">
      <img id="scene-image" class="scene-img" alt="scene" />
      <div id="scene-title" style="font-weight:600;margin-bottom:6px"></div>
      <div id="scene-text" style="white-space:pre-wrap;line-height:1.6"></div>
    </div>
    <div class="choices" id="choices"></div>
    <div id="ending" class="ending" style="display:none"></div>
    <button id="restart" class="choice-btn" style="display:none">${record.language==='en'?'Play again':'重新开始'}</button>
  </div>

  <script id="game-data" type="application/json">${dataJson}</script>
  <script>
    const data = JSON.parse(document.getElementById('game-data').textContent || '{}');
    const sceneById = new Map((data.scenes || []).map(s => [String(s.id), s]));
    let sceneId = String(data.startingSceneId || (data.scenes?.[0]?.id ?? ''));

    const $ = (id) => document.getElementById(id);
    const titleEl = $('game-title');
    const subtitleEl = $('game-subtitle');
    const sceneTitle = $('scene-title');
    const sceneText = $('scene-text');
    const sceneImage = $('scene-image');
    const choices = $('choices');
    const ending = $('ending');

    titleEl.textContent = data.title || 'Text Adventure';
    subtitleEl.textContent = data.setting ? (data.setting + ' · ' + (data.tone || '')) : (data.tone || '');

    function render() {
      const scene = sceneById.get(sceneId);
      if (!scene) return;
      sceneTitle.textContent = scene.title || '';
      sceneText.textContent = scene.text || scene.description || '';
      if (scene.image) {
        sceneImage.src = scene.image;
        sceneImage.style.display = 'block';
      } else {
        sceneImage.style.display = 'none';
      }
      const isEnding = scene.isEnding || (scene.choices || []).length === 0;
      choices.innerHTML = '';
      ending.style.display = isEnding ? 'block' : 'none';
      $('restart').style.display = isEnding ? 'block' : 'none';
      if (isEnding) {
        const labels=data.language==='en'?['Success','Failure','Ending']:['成功','失败','收束'];
        const label = scene.endingType === 'win' ? labels[0] : scene.endingType === 'fail' ? labels[1] : labels[2];
        ending.textContent = label + '：' + (scene.endingText || '故事结束。');
        return;
      }
      (scene.choices || []).forEach((c) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = c.text || '继续';
        btn.onclick = () => {
          sceneId = String(c.nextSceneId);
          render();
        };
        choices.appendChild(btn);
      });
    }

    $('restart').onclick=()=>{sceneId=String(data.startingSceneId);render();};
    render();
  </script>
</body>
</html>`;
}

export function buildSideScrollerGameData(record: GameRecord, assetBase?: string) {
  const base = normalizeAssetBase(assetBase);
  const plan = record.plan ?? {};
  const assetsMeta = record.assetMeta ?? {};
  const assets = Object.values(assetsMeta).map((a) => ({
    ...a,
    src: `${base}${a.file}`,
  }));
  return {
    title: plan.title ?? "Side Scroller",
    artStyle: plan.artStyle ?? "",
    elevatorPitch: plan.elevatorPitch ?? "",
    controls: plan.controls ?? [],
    coreLoop: plan.coreLoop ?? [],
    levels: plan.levels ?? [],
    assets,
  };
}

export function buildSideScrollerHtml(record: GameRecord, assetBase?: string) {
  const html = record.gameHtml;
  if (html && /<html/i.test(html)) {
    return assetBase ? rewriteAssetPaths(html, assetBase) : html;
  }
  throw new Error('Game HTML is not ready; generate a complete game first');
}

export async function buildZipBuffer(record: GameRecord, version?: GameVersion) {
  const zip = new JSZip();
  const html = version?.entryHtml || (record.mode === "text-adventure" ? buildTextAdventureHtml(record) : buildSideScrollerHtml(record));
  zip.file("index.html", html);

  const assetFiles = new Set<string>();
  if (record.images?.cover) assetFiles.add(record.images.cover);
  if (record.images?.scenes) {
    Object.values(record.images.scenes).forEach((f) => assetFiles.add(f));
  }
  if (record.images?.assets) {
    Object.values(record.images.assets).forEach((f) => assetFiles.add(f));
  }

  for (const file of assetFiles) {
    const buffer = version ? await readVersionAsset(version, file) : await readAssetFile(record.id, file);
    zip.file(`assets/${file}`, buffer);
  }

  const gameData = record.mode === "text-adventure"
    ? buildTextAdventureGameData(record)
    : buildSideScrollerGameData(record);

  zip.file("game.json", JSON.stringify(gameData, null, 2));
  zip.file('manifest.json', JSON.stringify({gameId: record.id, version: version?.id ?? null, entry: 'index.html', entrySha256:digest(html), assets: version?.assets ?? {}, verification: 'See improvement evidence; export does not establish human enjoyment'}, null, 2));

  return zip.generateAsync({ type: "nodebuffer" });
}
