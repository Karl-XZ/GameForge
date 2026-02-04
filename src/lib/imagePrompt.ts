import { randomUUID } from "crypto";

type Lang = "zh" | "en";

function isLikelyZh(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function variantHintFromId(assetId: string, lang: Lang) {
  if (!assetId || !assetId.includes("__")) return "";
  const suffix = assetId.split("__").slice(1).join("__");
  // Known suffix pattern: state_direction
  const parts = suffix.split("_");
  if (parts.length < 2) return "";
  const state = parts[0];
  const dir = parts[1];

  const stateMapZh: Record<string, string> = {
    idle: "待机",
    run: "奔跑",
    walk: "行走",
    jump: "跳跃",
    attack: "攻击",
    hit: "受击",
    die: "死亡",
  };
  const dirMapZh: Record<string, string> = {
    left: "面向左",
    right: "面向右",
    up: "面向上",
    down: "面向下",
  };

  const stateMapEn: Record<string, string> = {
    idle: "idle",
    run: "running",
    walk: "walking",
    jump: "jumping",
    attack: "attacking",
    hit: "hit reaction",
    die: "dying",
  };
  const dirMapEn: Record<string, string> = {
    left: "facing left",
    right: "facing right",
    up: "facing up",
    down: "facing down",
  };

  if (lang === "zh") {
    const s = stateMapZh[state] ?? state;
    const d = dirMapZh[dir] ?? dir;
    return `本图是\"${s}\"状态，${d}。`;
  }
  const s = stateMapEn[state] ?? state;
  const d = dirMapEn[dir] ?? dir;
  return `This image is a single-frame sprite: ${s}, ${d}.`;
}

/**
 * Remove the concept of "差分" / sprite sheets from character prompts,
 * and force a single-image, single-character output.
 */
export function sanitizeAssetPrompt(opts: {
  prompt: string;
  assetId?: string;
  assetType?: string;
  language?: Lang;
}) {
  const raw = String(opts.prompt ?? "").trim();
  if (!raw) return raw;

  const assetType = String(opts.assetType ?? "");
  const assetId = String(opts.assetId ?? "");
  const lang: Lang = opts.language ?? (isLikelyZh(raw) ? "zh" : "en");
  const isCharacter = ["player", "enemy", "npc"].includes(assetType) || assetId.includes("__");
  if (!isCharacter) return raw;

  let p = raw;

  // Strip "差分" concept and common sprite-sheet wording.
  p = p
    .replace(/差分(\s*图|\s*立绘|\s*素材)?/g, "")
    .replace(/表情\s*差分/g, "表情")
    .replace(/动作\s*差分/g, "动作")
    .replace(/\b(sprite\s*sheet|spritesheet|sheet\s*of\s*sprites|sprite\s*atlas)\b/gi, "")
    .replace(/(包含|包括).{0,20}(多个|多组|一组|一套).{0,20}(表情|动作|姿势|状态)/g, "$1$3")
    .replace(/\s{2,}/g, " ")
    .trim();

  const hint = variantHintFromId(assetId, lang);
  if (lang === "zh") {
    p +=
      `。${hint ? hint + " " : ""}仅生成单张PNG：单个角色、单个动作/单个表情/单个姿势。不要拼贴、不要多格、不要成组展示、不要多角色、不要分割线。不要任何文字、水印、logo。`;
  } else {
    p +=
      `. ${hint ? hint + " " : ""}Generate one PNG only: a single character, single pose/action/expression. No sprite sheets, no grids, no multiple variants in one image, no multiple characters, no borders. No text/watermarks/logos.`;
  }

  return p;
}

/**
 * Add a per-request nonce to avoid provider-side prompt caching.
 * The nonce is explicitly marked as non-visual.
 */
export function withRequestNonce(prompt: string, force?: boolean) {
  const p = String(prompt ?? "").trim();
  if (!p) return p;
  if (!force) return p;
  const id = randomUUID();
  return (
    `${p}\n\n` +
    `IMPORTANT: Generate a NEW variation; do not reuse cached results. ` +
    `Do not render any text. The token below is a non-visual request id; ignore it completely.\n` +
    `request_id: ${id}`
  );
}
