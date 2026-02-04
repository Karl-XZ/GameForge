export function buildTextAdventureOutlinePrompt(opts: { language: "zh" | "en"; userPrompt: string }) {
  const lang = opts.language;
  const zh = lang === "zh";

  return `You are a senior game designer.

TASK: Create a concise text-adventure outline as JSON.

USER IDEA:
${opts.userPrompt}

OUTPUT RULES:
- Output MUST be valid JSON that matches the provided JSON Schema.
- Keep language = "${lang}".
- Provide a strong premise, clear key beats, and at least 2 endings.

STYLE:
- ${zh ? "Use simplified Chinese." : "Use English."}
- Keep descriptions compact but evocative.

Now produce the JSON.`;
}

export function buildTextAdventureScenesPrompt(opts: {
  outline: any;
}) {
  const outline = JSON.stringify(opts.outline, null, 2);

  return `You are a senior game designer.

TASK: Expand the outline into a full branching text-adventure as JSON.

OUTLINE:
${outline}

OUTPUT RULES:
- Output MUST be valid JSON that matches the provided JSON Schema.
- Each scene MUST include cgPrompt (image prompt) in the same language as the outline.
- Make sure every choice's nextSceneId points to an existing scene.
- Create at least 2 endings (win/fail).
- For ending scenes, set isEnding=true and choices=[].

Now produce the JSON.`;
}

export function buildSideScrollerPlanPrompt(opts: { language: "zh" | "en"; userPrompt: string }) {
  const lang = opts.language;
  const zh = lang === "zh";

  return `You are a senior game designer.

TASK: Design a side-scroller action game AND list all image assets as JSON.

USER IDEA:
${opts.userPrompt}

OUTPUT RULES:
- Output MUST be valid JSON that matches the provided JSON Schema.
- Include an assets array with complete image prompts.
- For each asset set needsCutout=true if it must have transparency.
- Every playerAbilities item MUST include an input field (e.g. "Z: Attack", "Space: Jump").
- Keep language = "${lang}".

DESIGN CONSTRAINTS:
- Provide 3-6 levels.
- Provide 3-8 enemies with simple behaviors.
- Include clear controls and core loop.
- For each level, provide a clear objective and 2-4 setPieces.

ASSET RULES (IMPORTANT):
- ${zh ? "每个 asset.prompt 必须只描述【单张】图片（单个对象/单个角色），不要在提示词里使用“差分/差分图”的概念，也不要要求一张图里包含多个表情/动作/姿势。" : "Each asset.prompt MUST describe ONE image only (single object/character). Do NOT ask for sprite sheets, grids, or multiple variants in a single image."}
- ${zh ? "如果角色需要动作/方向变化，请把每一张图拆成独立的 asset，并使用 id 后缀约定：__idle_left, __idle_right, __run_left, __run_right, __attack_left, __attack_right。" : "If character animation variants are needed, list them as separate assets using id suffixes: __idle_left, __idle_right, __run_left, __run_right, __attack_left, __attack_right."}
- ${zh ? "只要某个角色出现了带 __ 的变体（例如 hero__run_left），就必须额外提供一个对应的正面参考图：hero__front。该 prompt 要完整描述角色外观（脸型/发型/服装/配色/装饰物），并明确是正面、自然站立/待机姿势。" : "Whenever a character has any __ variants (e.g. hero__run_left), you MUST also include a matching front reference asset: hero__front. Its prompt must fully define the character's identity (face/hair/outfit/colors/accessories) and specify a front-facing neutral idle standing pose."}
- ${zh ? "所有该角色的其他变体 prompt 必须保持同一角色外观一致，只描述姿势/动作/方向变化，并可注明“同一角色（参考 hero__front）”。" : "All other variants for that character must keep the exact same character design and only describe pose/action/facing changes, optionally stating 'same character (reference hero__front)'."}

STYLE:
- ${zh ? "Use simplified Chinese." : "Use English."}

Now produce the JSON.`;
}

export function buildSideScrollerGameHtmlPrompt(opts: {
  plan: any;
  assets: { id: string; type: string; file: string }[];
}) {
  const plan = JSON.stringify(opts.plan, null, 2);
  const assets = JSON.stringify(opts.assets, null, 2);

  return `You are a senior game developer.

TASK: Produce a complete, runnable HTML5 side-scroller game.

RULES:
- Output ONLY raw HTML (no markdown).
- Use <canvas> and vanilla JS (no external libraries, no CDN).
- Load assets from relative paths in ./assets/.
- Include basic controls: arrow keys to move, up to jump, Z to attack.
- Ensure the game runs from file:// (no fetch required).

SPRITES:
- Character assets (type player/enemy/npc) may include action+direction variants using this id convention:
  __idle_left, __idle_right, __run_left, __run_right, __attack_left, __attack_right
- Example: if a base character id is "hero", you may receive "hero__run_left" etc.
- A base id like "hero" (if present) should be treated as a fallback for idle_right.
- A front reference id like "hero__front" (if present) should also be treated as a fallback for idle_right.
- When rendering, choose sprite by STATE (idle/run/attack) and FACING (left/right). Use fallbacks if a variant is missing.
- Keep sprite sizes consistent on screen (no huge jumps between frames). Prefer full-body, centered sprites.

GAME DESIGN:
${plan}

ASSETS (id/type/file):
${assets}

Return the final HTML now.`;
}

export function buildCoverPromptFromOutline(data: any) {
  return `Game cover art, cinematic key visual. Title: ${String(data?.title ?? "")}. Setting: ${String(
    data?.setting ?? ""
  )}. Tone: ${String(data?.tone ?? "")}. Highly detailed, atmospheric, concept art, no text, no watermark.`;
}
