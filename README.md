# GameForge

**Anyone can generate their own game in five minutes.**
A generative game workshop built with the **Google Gemini 3 API**.

> Live demo: *https://www.youtube.com/watch?v=aeXrNsM2Txk*
> 3-minute video: *https://game-forge-qyijkafnq-karl-xzs-projects.vercel.app/en*

---

## Inspiration

Making a tiny game should feel like sketching an idea on a napkin.

But in practice, even â€œsmallâ€?games come with a pile of chores: outline a story, break it into scenes, write branching choices, decide what assets you need, hunt for sprites, clean up backgrounds, wire everything into code, package a build, then repeat when one part doesnâ€™t feel right.

Thatâ€™s the gap GameForge tries to close.

GameForge is built for creators who want to move fast: students doing a class project, writers prototyping interactive fiction, designers validating a concept, or anyone who just wants to play something they imaginedâ€”without spending a weekend on tooling. The goal is simple: **type an idea, and five minutes later youâ€™re clicking â€œPlay.â€?*

---

## What it does

GameForge turns a short prompt into a **playable** game you can run in the browser and **export as a zip** (offline, no login required).

It supports two game types:

### 1) Text Adventure / TRPG

* Generates a **Plot Outline (JSON)** you can edit
* Expands it into **Scene JSON** with branching choices
* Generates **one image per scene**
* Produces a playable build + zip download

### 2) Side-Scroller Action

* Generates an **Asset List (JSON)** (characters, enemies, tiles, UI, props)
* Generates asset images (sprites + backgrounds)
* Automatically removes green-screen backgrounds for transparent PNGs
* Generates runnable game code + playable build + zip download

In both modes, you can run **one-click end-to-end**, or go **step-by-step** and edit the JSON at each stage.

---

## How to use

### Online (recommended for judges)

1. Open the demo link
2. Pick a mode: **Text Adventure / TRPG** or **Side-Scroller Action**
3. Enter an idea, select language + models
4. Click **One-Click Generate** (or run step-by-step)
5. **Play** in the browser or **Export zip**

### Local development

#### Prerequisites

* Node.js 18+

#### Install

```bash
npm install
```

#### Configure environment variables

Create `.env.local`:

```bash
GEMINI_API_KEY=YOUR_KEY_HERE

# Optional defaults
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

For Vercel deployment, also set the storage env vars (Vercel KV + Blob):

```bash
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
BLOB_READ_WRITE_TOKEN=
```

#### Run

```bash
npm run dev
```

Open `http://localhost:3000`

---

## Gemini 3 Integration

GameForge uses Gemini 3 as more than a â€œprompt in, text outâ€?layer. Itâ€™s the coordinator that keeps the pipeline coherent from idea â†?assets â†?code.

### Structured generation (JSON-first)

Gemini 3 generates **structured JSON** for:

* Plot outlines (TRPG)
* Scene graphs and branching choices
* Asset manifests (side-scroller)

We validate and reuse these structures across steps, so users can edit outputs directly without breaking the rest of the pipeline.

### Multimodal asset creation (text-to-image + image-to-image)

Sprites are not useful if a character looks different in every pose. For characters, GameForge generates a single **front reference** sprite (`__front`) first, then uses **image-to-image** to produce action/direction variants (run/idle/attack, left/right) while enforcing identity constraints (same face, outfit, palette, style).

### Code generation that actually runs

Gemini 3 generates runnable HTML5 game code (and updates it after edits), then we wire it to the generated assets so â€œPlayâ€?is immediate.

### Reliability: retry means retry

Regeneration is treated as a first-class feature. When you click **Single Asset Retry** or re-run **Generate All**, requests are forced fresh (unique request stamps + cache-busting) so you donâ€™t get stuck on the same image.

---

## How we built it

GameForge is a Next.js app with server routes that orchestrate the generation pipeline.

### Stack

* **Next.js** (App Router) for UI + API routes
* **Gemini 3 API** for planning, generation, and code synthesis
* **Schema validation** for JSON outputs (so steps donâ€™t drift)
* **Image post-processing** for green-screen cutout
* **Phaser** for the side-scroller runtime
* **Zip export** so games can run offline

### Pipeline (conceptually)

```
Idea
 â†?(Gemini 3) Plan JSON
 â†?(Gemini 3) Scenes / Assets JSON
 â†?(Gemini 3) Images
      - character: __front first
      - variants: image-to-image
 â†?(Local) Green-screen cutout â†?transparent PNG
 â†?(Gemini 3) Runnable game code
 â†?Export zip (offline playable)
```

---

## Challenges we ran into

### Character â€œvariantsâ€?turning into sprite collages

If prompts mention â€œvariants / differences / sheets,â€?image models often produce a single image containing multiple poses. That looks fine as an illustrationâ€”but it becomes a nightmare in a game pipeline.

**Fix:** treat variants as a dependency graph. Generate `__front` once, then image-to-image every variant from that reference. Prompts are sanitized to forbid â€œsprite sheet / collage / multi-panel.â€?
### Green screens arenâ€™t one green

Real outputs vary: neon green, yellow-green, darker green, uneven lighting, even gradients. A single hard-coded chroma key fails in surprising ways.

**Fix:** detect the dominant green from the border, then do a two-pass key (strict â†?relaxed). If results look wrong, fall back to a safer legacy keying path.

### Retry wasnâ€™t really retrying

Browsers and providers love caching. Users click â€œretryâ€?expecting a new resultâ€”and sometimes get the same image back.

**Fix:** every image request can be forced fresh using a nonce, and every rendered asset URL is cache-busted so the UI always reloads.

### Serverless file systems on Vercel

You can't write to the project directory at runtime (`/var/task`). Attempts to cache or mkdir there will fail.

**Fix:** store game records in **Vercel KV** and assets in **Vercel Blob**. This avoids reliance on `/tmp` across requests and prevents data loss on cold starts.

---

## Accomplishments that we're proud of

* **Playability as a first-class output**: you donâ€™t end with a document; you end with a game you can click and run.
* **Editable JSON workflow**: creators can steer the result without re-prompting everything.
* **Consistent character sprites** using `__front` + image-to-image, which makes the side-scroller feel like a coherent game instead of a moodboard.
* **Robust â€œgood enoughâ€?cutout** that turns green-screen sprites into usable transparent PNGs automatically.
* **Offline export** that judges can run immediately without accounts, paywalls, or setup.

---

## What we learned

We expected â€œgeneration qualityâ€?to be the hard part. It wasnâ€™t.

The bigger challenge was building a pipeline people can actually iterate on. In a creative tool, the moment something doesnâ€™t behave predictablyâ€”retry returns the same image, a sprite has a weird background, a character changes identityâ€”trust evaporates.

We also learned that small constraints make huge differences. A single design decisionâ€?always generate a reference sprite first*â€”did more for consistency than a dozen prompt tweaks. And for post-processing, â€œone clever heuristicâ€?rarely wins; layered strategies with fallbacks beat fragile perfection.

Most importantly: if the goal is â€œfive minutes,â€?the workflow has to feel forgiving. Fast iteration is the product.

---

## Whatâ€™s next for GameForge

* **Project persistence & sharing** via Vercel KV + Blob (or GCS): save and share games with a link
* **Style kits** (pixel / watercolor / vector) with tighter cross-asset consistency
* More genres: **top-down RPG**, **visual novel**, **tower defense**
* Better animation tooling: hitbox helpers, frame tools, optional sprite-sheet packing
* A playtest loop: play â†?give feedback â†?patch plan/assets/code automatically

---

## Troubleshooting

* **401 / missing key**: set `GEMINI_API_KEY` in `.env.local` (local) or Vercel env vars (deploy)
* **Vercel 404 Game not found / data resets**: ensure Vercel KV + Blob env vars are set (KV_* and BLOB_READ_WRITE_TOKEN)
* **Timeouts on deploy**: generate in smaller batches or increase function limits
* **Sharp issues locally**: use Node 18+ and reinstall deps (`rm -rf node_modules && npm i`)

---




