type Lang = "zh" | "en";

export function isCharacterAsset(assetType: string) {
  return ["player", "enemy", "npc"].includes(String(assetType ?? "").toLowerCase());
}

export function splitVariantId(assetId: string) {
  const id = String(assetId ?? "");
  if (!id.includes("__")) return { base: id, suffix: "" };
  const [base, ...rest] = id.split("__");
  return { base, suffix: rest.join("__") };
}

export function frontIdFor(assetId: string) {
  const { base } = splitVariantId(assetId);
  if (!base) return "";
  return `${base}__front`;
}

export function isFrontId(assetId: string) {
  return String(assetId ?? "").endsWith("__front");
}

export function isVariantId(assetId: string) {
  const id = String(assetId ?? "");
  return id.includes("__") && !isFrontId(id);
}

function stripTrailingPunctuation(text: string) {
  return String(text ?? "").replace(/[\s\u3000]+$/g, "").replace(/[。.!?]+$/g, "");
}

/**
 * A "canonical" prompt for the character's front-facing reference sprite.
 * We intentionally override any action/direction the original prompt might mention.
 */
export function buildFrontReferencePrompt(opts: { prompt: string; lang: Lang }) {
  const p = stripTrailingPunctuation(opts.prompt);
  if (opts.lang === "zh") {
    return (
      `${p}。` +
      `这是该角色的【正面参考图】（用于后续图生图保持一致性）。` +
      `忽略上文任何动作/方向描述，仅绘制单个角色：正面朝向镜头、自然站立/待机姿势、全身、居中。` +
      `保持脸型、发型、服装、配色、材质、装饰物在所有后续变体中完全一致。`
    );
  }
  return (
    `${p}. ` +
    `This is the canonical FRONT reference image for the character (used for image-to-image consistency). ` +
    `Ignore any prior action/direction; render ONE character: front-facing, neutral idle standing pose, full-body, centered. ` +
    `Keep the same face, hair, outfit, colors, materials, and accessories for all later variants.`
  );
}

/**
 * Extra instructions appended to a variant prompt when we do image-to-image.
 */
export function buildVariantConsistencyAddon(opts: { assetId: string; frontId: string; lang: Lang }) {
  const id = String(opts.assetId ?? "");
  const front = String(opts.frontId ?? "");
  if (opts.lang === "zh") {
    return (
      `\n\n一致性要求：使用提供的参考图作为同一角色的正面基准（${front}）。` +
      `必须保持脸型、发型、服装、配色、装饰物、画风一致；只根据本图需求改变姿势/动作/朝向/表情。` +
      `不要生成拼贴/多格/多版本。`
    );
  }
  return (
    `\n\nConsistency: Use the provided reference image as the same character baseline (${front}). ` +
    `Keep face, hair, outfit, colors, accessories, and style identical; only change pose/action/facing/expression as requested for ${id}. ` +
    `No grids/collages/multiple variants.`
  );
}

export type SideAsset = {
  id: string;
  type: string;
  prompt: string;
  needsCutout: boolean;
  tags?: string[];
};

/**
 * Ensure that for every character that has variants (id contains "__"),
 * we have a corresponding "__front" reference asset.
 *
 * It also ensures the front reference appears BEFORE the first variant in the list.
 */
export function injectFrontAssets(opts: { assets: SideAsset[]; lang: Lang }) {
  const assets = opts.assets ?? [];
  const byId = new Map<string, SideAsset>();
  for (const a of assets) byId.set(a.id, a);

  // Find variant groups.
  const firstVariantIndex = new Map<string, number>();
  const groupInfo = new Map<string, { type: string; needsCutout: boolean; samplePrompt: string }>();

  assets.forEach((a, idx) => {
    if (!isCharacterAsset(a.type)) return;
    if (!isVariantId(a.id)) return;
    const base = splitVariantId(a.id).base;
    if (!base) return;
    if (!firstVariantIndex.has(base)) firstVariantIndex.set(base, idx);
    const prev = groupInfo.get(base);
    groupInfo.set(base, {
      type: prev?.type ?? a.type,
      needsCutout: (prev?.needsCutout ?? false) || !!a.needsCutout,
      samplePrompt: prev?.samplePrompt ?? a.prompt,
    });
  });

  const added: SideAsset[] = [];
  for (const [base, info] of groupInfo.entries()) {
    const fid = `${base}__front`;
    if (byId.has(fid)) continue;
    const frontPrompt = buildFrontReferencePrompt({ prompt: info.samplePrompt, lang: opts.lang });
    const front: SideAsset = {
      id: fid,
      type: info.type as any,
      needsCutout: info.needsCutout,
      prompt: frontPrompt,
      tags: ["front", "base"],
    };
    byId.set(fid, front);
    added.push(front);
  }

  if (added.length === 0) return { assets, added: [] as SideAsset[] };

  // Insert fronts before the first variant occurrence of each base.
  const inserted = new Set<string>();
  const out: SideAsset[] = [];
  assets.forEach((a, idx) => {
    const base = isVariantId(a.id) ? splitVariantId(a.id).base : "";
    if (base && groupInfo.has(base)) {
      const fid = `${base}__front`;
      const firstIdx = firstVariantIndex.get(base);
      if (firstIdx === idx && !inserted.has(fid)) {
        const front = byId.get(fid);
        if (front) {
          out.push(front);
          inserted.add(fid);
        }
      }
    }
    out.push(a);
  });

  // If somehow we didn't insert a front (edge-case), append it.
  for (const a of added) {
    if (!inserted.has(a.id)) out.unshift(a);
  }

  return { assets: out, added };
}
