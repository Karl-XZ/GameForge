import JSZip from "jszip";
import { readAssetFile } from "@/lib/store";
import type { GameRecord } from "@/lib/store";

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
      if (isEnding) {
        const label = scene.endingType === 'win' ? '成功' : scene.endingType === 'fail' ? '失败' : '收束';
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

function fallbackSideScrollerHtml(record: GameRecord, assetBase?: string) {
  const data = buildSideScrollerGameData(record, assetBase);
  const dataJson = escapeJson(data);

  return `<!DOCTYPE html>
<html lang="${record.language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.title || "Side Scroller"}</title>
  <style>
    body { margin:0; background:#0b0f17; color:#e2e8f0; font-family:system-ui, -apple-system, Segoe UI, sans-serif; }
    #hud { padding: 12px 16px; font-size: 14px; }
    #game { display:block; margin:0 auto; background:#020617; border-top:1px solid #1f2937; }
    .hint { color:#94a3b8; font-size:12px; margin-top:6px; }
  </style>
</head>
<body>
  <div id="hud">
    <div style="font-weight:600">${data.title || "Side Scroller"}</div>
    <div>${data.elevatorPitch || ""}</div>
    <div class="hint">Controls: ←/→ move, ↑ jump, Z attack</div>
  </div>
  <canvas id="game" width="900" height="520"></canvas>

  <script id="game-data" type="application/json">${dataJson}</script>
  <script>
    const data = JSON.parse(document.getElementById('game-data').textContent || '{}');
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const assetByType = (type) => (data.assets || []).find(a => a.type === type) || null;
    const playerAsset = assetByType('player');
    const enemyAsset = assetByType('enemy') || assetByType('npc');
    const bgAsset = assetByType('background');
    const platformAsset = assetByType('platform') || assetByType('tile');

    const images = {};
    const toLoad = [playerAsset, enemyAsset, bgAsset, platformAsset].filter(Boolean);
    let loaded = 0;

    function loadImages() {
      if (toLoad.length === 0) init();
      toLoad.forEach((a) => {
        const img = new Image();
        img.onload = () => { loaded++; if (loaded === toLoad.length) init(); };
        img.src = a.src;
        images[a.type] = img;
        if (a.type === 'npc' && !images.enemy) images.enemy = img;
        if (a.type === 'tile' && !images.platform) images.platform = img;
      });
    }

    const keys = new Set();
    window.addEventListener('keydown', (e) => { keys.add(e.key); });
    window.addEventListener('keyup', (e) => { keys.delete(e.key); });

    const level = (data.levels || [])[0] || {};
    const platforms = [];
    const layout = Array.isArray(level.platformLayout) ? level.platformLayout : [];
    layout.forEach((p) => {
      const x = Math.max(0, Math.min(1, p.x)) * (W - 200);
      const y = 80 + Math.max(0, Math.min(1, p.y)) * 320;
      const w = 100 + Math.max(0.05, Math.min(1, p.width)) * 380;
      platforms.push({ x, y, w, h: 20 });
    });
    platforms.push({ x: 0, y: H - 30, w: W, h: 30 });

    const player = { x: 80, y: H - 120, w: 48, h: 48, vx: 0, vy: 0, onGround: false };
    const enemies = Array.from({ length: 4 }).map((_, i) => ({ x: 420 + i * 120, y: H - 120, w: 36, h: 36, vx: (i % 2 === 0 ? 1 : -1) * 1.2 }));

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function update() {
      player.vx = 0;
      if (keys.has('ArrowLeft')) player.vx = -3;
      if (keys.has('ArrowRight')) player.vx = 3;
      if (keys.has('ArrowUp') && player.onGround) { player.vy = -9; player.onGround = false; }

      player.vy += 0.4;
      player.x += player.vx;
      player.y += player.vy;

      player.onGround = false;
      platforms.forEach((p) => {
        if (rectsOverlap(player, p)) {
          if (player.vy > 0) {
            player.y = p.y - player.h;
            player.vy = 0;
            player.onGround = true;
          }
        }
      });

      enemies.forEach((e) => {
        e.x += e.vx;
        if (e.x < 0 || e.x + e.w > W) e.vx *= -1;
        if (keys.has('z') || keys.has('Z')) {
          const dx = e.x - player.x;
          if (Math.abs(dx) < 60 && Math.abs(e.y - player.y) < 40) {
            e.vx = dx > 0 ? 3 : -3;
          }
        }
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (images.background) {
        ctx.drawImage(images.background, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b1020');
        g.addColorStop(1, '#020617');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.fillStyle = '#1f2937';
      platforms.forEach((p) => {
        if (images.platform) {
          ctx.drawImage(images.platform, p.x, p.y, p.w, p.h);
        } else {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
      });

      if (images.player) ctx.drawImage(images.player, player.x, player.y, player.w, player.h);
      else { ctx.fillStyle = '#7c3aed'; ctx.fillRect(player.x, player.y, player.w, player.h); }

      enemies.forEach((e) => {
        if (images.enemy) ctx.drawImage(images.enemy, e.x, e.y, e.w, e.h);
        else { ctx.fillStyle = '#22c55e'; ctx.fillRect(e.x, e.y, e.w, e.h); }
      });
    }

    function loop() {
      update();
      draw();
      requestAnimationFrame(loop);
    }

    function init() {
      loop();
    }

    loadImages();
  </script>
</body>
</html>`;
}

export function buildSideScrollerHtml(record: GameRecord, assetBase?: string) {
  const html = record.gameHtml?.trim();
  if (html && /<html/i.test(html) && !/https?:\/\//i.test(html)) {
    return assetBase ? rewriteAssetPaths(html, assetBase) : html;
  }
  return fallbackSideScrollerHtml(record, assetBase);
}

export async function buildZipBuffer(record: GameRecord) {
  const zip = new JSZip();
  const html = record.mode === "text-adventure" ? buildTextAdventureHtml(record) : buildSideScrollerHtml(record);
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
    const buffer = await readAssetFile(record.id, file);
    zip.file(`assets/${file}`, buffer);
  }

  const gameData = record.mode === "text-adventure"
    ? buildTextAdventureGameData(record)
    : buildSideScrollerGameData(record);

  zip.file("game.json", JSON.stringify(gameData, null, 2));

  return zip.generateAsync({ type: "nodebuffer" });
}
