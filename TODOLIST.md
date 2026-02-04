# TODOLIST

The following is the implementation checklist broken down by requirements (recommended to complete in stages).

## Phase 0: Existing Code Organization
- [x] Review generation interfaces and data structures, clarify step-by-step process and state machine
- [x] Define unified task ID / game ID
- [x] Unified logging and progress output (for frontend visualization)
- [x] Design general mechanism for "step-by-step edit and resubmission" (each step can be rolled back/retried)
- [x] Add "one-click generate to end" full pipeline task orchestration and button (can pause/rollback)
- [x] Clarify "one-click mode" auto-confirmation strategy and interruption recovery strategy
- [x] Clarify JSON Schema and data field conventions (avoid multi-stage drift)

## Phase 1: Text Adventure / TRPG Pipeline
- [x] Generate "plot outline" interface (supports editing and resubmission)
- [x] Plot outline editing UI + confirm button
- [x] Generate "scene JSON" interface (including text, branch options, CG prompts, etc.)
- [x] Scene JSON editable and resubmittable (supports single scene correction)
- [x] Generate images scene by scene and cache (failure can retry)
- [x] CG prompts editable and single scene retry image generation
- [x] Assemble offline-run `index.html`

## Phase 2: Side-Scroller Action Pipeline
- [x] AI outputs asset list JSON (including transparent background requirement marker)
- [x] Asset list editable and resubmittable (supports single asset correction)
- [x] Generate all asset images (assets requiring matting use pure green background)
- [x] Asset generation supports per-item retry and replacement
- [x] Local matting algorithm (green screen → transparent PNG)
- [x] Assets + requirements handed to AI to generate complete HTML5 game
- [x] Assemble offline-run `index.html`

## Phase 3: Play & Download
- [x] Add `/game/[id]` page (standalone play)
- [x] Homepage only shows generation pipeline and result entry points
- [x] Zip export (`index.html` + assets + game.json optional)
- [x] `index.html` inline JSON data (avoid `file://` fetch failure)
- [x] Asset naming and path mapping conventions (zip internal structure consistent)
- [x] Download button and download status indicator

## Phase 4: Storage & Reuse
- [x] Generation result persistence (local or temporary storage)
- [x] Support reopening historical games (based on ID)
- [x] Incremental generation and retry strategy
- [x] Intermediate artifact persistence (outline / scene JSON / asset list / images)
- [x] Recovery and continued execution after one-click mode interruption

## Phase 5: Quality Assurance
- [ ] Offline / `file://` run testing
- [ ] Offline package check (no external CDNs / no network requests)
- [ ] Image matting quality check
- [x] Structured JSON validation and fallback repair
- [ ] Generation time and cost monitoring
