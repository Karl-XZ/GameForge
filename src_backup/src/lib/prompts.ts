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
