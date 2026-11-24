# GameForge experience evolution implementation plan

> For agentic workers: use superpowers:executing-plans. Execute in this session; use one independent whole-branch review after implementation.

**Goal:** Deliver real model-backed game generation and evidence-driven improvement with durable versions, isolated gameplay, conservative retention and identical tested/exported artifacts.

**Architecture:** Keep Next.js and existing creation flows. Vendor the MIT-licensed RGC engine at commit 8284cae and use a Python HTTP-model adapter in a separate Linux worker. Browser operations run in its Docker runtime. App jobs are durable files; credentials remain server-only. Windows development starts the Linux worker through WSL.

**Spec:** ../../../../GameForge-需求文档-20261124/requirements-source.txt (FR01–FR25, AC01–AC15). Product direction and execution are authorized by the user's implementation request; defaults remain configurable.

## Global constraints
- Never commit credentials, generated test games or raw provider errors containing secrets.
- Preserve historical games; snapshots include source and frozen assets; edits invalidate downstream results.
- Test actual original artifacts before claiming an improvement. A first validated baseline is not an improvement.
- Model review is a proxy. Do not claim human enjoyment or invent a human study.
- No gameplay without isolated runtime readiness. Fail visibly rather than running generated code with host credentials.
- New image generation must be explicit; reuse existing assets for improvement.

## Review focus
- Same asset filename overwritten after a version snapshot must not mutate old games.
- Concurrent edit during improvement must not silently replace a newer version.
- Stop/resume, duplicate requests and model budget failures must not double-dispatch completed work.
- Evidence, version and exported bytes must agree, including model output containing URLs.
- Cross-project/path traversal and generated HTML access to app APIs must be rejected.

## Task 1 Provider configuration and reproducible checks
Files: src/lib/providers.ts, src/lib/gemini.ts, src/app/api/models/route.ts, tests/providers.test.ts, package.json, tsconfig.json, .env.example.
Interface: configuredModels() returns public descriptors; complete({model,prompt,images?,signal?}) returns text and usage, never keys. Existing generateText/generateStructured callers remain compatible.
- [x] Write failing tests for provider routing, model validation, fence parsing and secret redaction; run RED.
- [x] Implement DeepSeek/Qwen compatibility, bounded requests, JSON validation/repair and image configuration.
- [x] Install dependencies; run tests, baseline typecheck/build; record inherited failures and fix those affecting delivery.

## Task 2 Immutable versions and consistent delivery
Files: src/lib/store.ts, src/lib/versions.ts, src/lib/export.ts, version routes and game page, tests/versions.test.ts.
Interface: snapshotGame(id), loadVersion(gameId,versionId), selectVersion(gameId,versionId,expectedVersion) are shared by preview, download and jobs.
- [x] Test immutability, invalid identifiers, stale selection and exact exported HTML before implementation.
- [x] Snapshot records/assets with SHA-256 identity; serialize mutations; historical records migrate on first use.
- [x] Remove silent HTML replacement; deliver manifest and sandboxed version previews; pass tests.

## Task 3 Shared generation and executable interface
Files: src/lib/generation.ts, src/lib/prompts.ts, generation and mutation routes, tests/generation.test.ts.
Interface: generateGame(input,onEvent?) persists each completed stage; generated HTML implements GameAgentBridge.reset/observe with normal key inputs.
- [x] Pin bridge requirements, scene graph validity, asset identity and downstream invalidation in failing tests.
- [x] Share one-click/staged processing, reference assets and model defaults; preserve compatible route contracts.
- [x] Confirm original content remains visible on generation failures and retry resumes persisted stages.

## Task 4 Independent RGC execution and jobs
Files: worker/vendor, worker/model_agent.py, worker/runner.py, worker/Dockerfile, src/lib/improvement.ts, improvement/evidence/feedback routes, tests/improvement.test.ts, worker/tests.
Interface: createRun(gameId,baseVersion,goal,budgets), getRun, stopRun, resumeRun; worker receives a snapshot with no web credentials and reports hash-verified artifacts.
- [x] Failing tests for promotion, baseline identity, budget enforcement, tampered evidence, stop/resume and stale base.
- [x] Reuse upstream DockerGame through a trusted HTTP controller and inert JSON player policies; explicitly record original baseline before candidates.
- [x] Save receipts, actual trajectories, images/video, independent A/B orders and retained snapshot; never silently import failed/stale output.
- [x] Test both successful and rejected candidates using deterministic fixtures; real runs remain separately labelled.

## Task 5 Product integration and real acceptance
Files: src/components/ImprovementPanel.tsx, src/app/[locale]/page.tsx, messages, docs/TEST_REPORT.md, scripts/live-e2e.mjs.
- [x] Add goal/constraints/budgets, real progress, stop/resume, evidence, version compare/select and feedback; preserve bilingual flows.
- [x] Test three different real model-generated HTML games in browser; preserve requests, sanitized usage and runtime evidence.
- [x] Verify downloads offline, manual edit conflict, old assets, cancellation/recovery and no-improvement delivery.
- [x] Run full suite/typecheck/lint/build, fresh whole-branch review and fixes; document any external blocker precisely.

## Execution ledger
- Started on codex/experience-evolution, original checkout clean at 04a3a7c.
- Ruling: work in the clean cloned checkout on a feature branch, preserving main; no additional worktree required.
- Ruling: user's provided compatible-provider credentials authorize actual model testing; discover model IDs through /models rather than guessing.
- Environment: Windows host; Ubuntu WSL Python 3.12 available; Docker initially stopped; bundled Node 24 used because global npm launcher is broken.
- Interface preflight: version snapshot is the worker input and the sole preview/export source; task results cannot directly mutate current GameRecord without an expected-version check.

- Integration adjustment: reuse the MIT RGC isolated engine and evidence API; use a small HTTP controller and data-only JSON policies instead of requiring Codex/Harbor sessions or running model-authored Python on the host. This is not a reproduction of all paper experiments.
- Real acceptance: three model-generated platformers, actual image assets, reversed model reviews, original retention, one promoted candidate, interrupted worker recovery with one cached player call, four-call budget termination, edit conflict, evidence tamper rejection and frozen offline exports exercised.
- Independent reviewer findings were fixed, including complete rollback, lock contention/listing, Origin validation with real Host, worker startup/heartbeat, stop/resume cleanup, launch token races and generation config invalidation.
- No human study was performed. See docs/TEST_REPORT.md for actual scope and evidence.
