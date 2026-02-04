"use client";

import * as React from "react";
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Tabs } from "@/components/ui";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  GenerationProgress,
  type LogEntry,
  type ProgressStep,
  type StepStatus,
} from "@/components/GenerationProgress";

type Mode = "text-adventure" | "side-scroller";

type GameSummary = {
  id: string;
  mode: Mode;
  status: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
};

const TEXT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
];

// NOTE:
// We want the "Idea / Requirement" input to be pre-filled with a helpful example
// in the current UI language. Instead of hardcoding strings here, we reuse the
// existing i18n placeholder (home.promptPlaceholder) so that translations stay
// in one place.

export default function Home() {
  const t = useTranslations('home');
  const tc = useTranslations('common');

  // UI locale (from route: /[locale])
  const uiLocale = useLocale() as 'en' | 'zh';

  const [mode, setMode] = React.useState<Mode>("text-adventure");
  const [language, setLanguage] = React.useState<"zh" | "en">(() => (uiLocale === 'en' ? 'en' : 'zh'));
  const [prompt, setPrompt] = React.useState<string>(() => t('promptPlaceholder'));
  const [textModel, setTextModel] = React.useState<string>(TEXT_MODELS[0]);
  const [imageModel, setImageModel] = React.useState<string>(IMAGE_MODELS[0]);

  const [gameId, setGameId] = React.useState<string | null>(null);
  const [outlineText, setOutlineText] = React.useState<string>("");
  const [scenesText, setScenesText] = React.useState<string>("");
  const [planText, setPlanText] = React.useState<string>("");
  const [gameHtml, setGameHtml] = React.useState<string>("");

  // Incremental edit chat (Step 1 & Step 3)
  const [step1Chat, setStep1Chat] = React.useState<string>("");
  const [step3Chat, setStep3Chat] = React.useState<string>("");
  const [chatBusy, setChatBusy] = React.useState<string | null>(null);

  const [loadingStep, setLoadingStep] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [games, setGames] = React.useState<GameSummary[]>([]);
  const [imageFiles, setImageFiles] = React.useState<Record<string, string>>({});
  // Cache-busting versions for <img> tags. Even with no-store headers,
  // some clients/CDNs may display a stale image if the URL stays identical.
  const [imageVersions, setImageVersions] = React.useState<Record<string, number>>({});
  const [coverFile, setCoverFile] = React.useState<string | null>(null);

  const [progress, setProgress] = React.useState<{ percent: number; steps: ProgressStep[]; logs: LogEntry[] }>({
    percent: 0,
    steps: [],
    logs: [],
  });
  const [streaming, setStreaming] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  type StreamEvent =
    | { type: "init"; steps: { id: string; title: string }[]; mode?: Mode }
    | { type: "step"; id: string; status: StepStatus; percent?: number; message?: string }
    | { type: "log"; ts?: string; level?: "info" | "warn" | "error"; message: string }
    | { type: "result"; result: { ok: boolean; gameId?: string } }
    | { type: "fatal"; error: string };

  React.useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    const res = await fetch("/api/games").catch(() => null);
    if (!res || !res.ok) return;
    const data = await res.json();
    setGames(data.games ?? []);
  }

  async function handleDeleteGame(id: string) {
    const ok = window.confirm(t('errors.deleteConfirm'));
    if (!ok) return;
    const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t('errors.deleteFailed'));
      return;
    }
    if (gameId === id) {
      setGameId(null);
      setOutlineText("");
      setScenesText("");
      setPlanText("");
      setGameHtml("");
      setImageFiles({});
      setImageVersions({});
      setCoverFile(null);
    }
    await fetchGames();
  }

  async function loadGame(id: string) {
    const res = await fetch(`/api/games/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const record = data.record;
    setGameId(record.id);
    setMode(record.mode);
    setLanguage(record.language);
    setTextModel(record.textModel);
    setImageModel(record.imageModel);
    setPrompt(record.prompt ?? "");
    setOutlineText(record.outline ? JSON.stringify(record.outline, null, 2) : "");
    setScenesText(record.scenes ? JSON.stringify(record.scenes, null, 2) : "");
    setPlanText(record.plan ? JSON.stringify(record.plan, null, 2) : "");
    setGameHtml(record.gameHtml ?? "");
    // Images are stored separately for text-adventure (scenes/cover) and side-scroller (assets).
    const files =
      record.mode === "side-scroller"
        ? (record.images?.assets ?? {})
        : (record.images?.scenes ?? {});
    setImageFiles(files);
    // Bump versions so the browser always fetches fresh images on load.
    const now = Date.now();
    setImageVersions(Object.fromEntries(Object.keys(files).map((k) => [k, now])));
    setCoverFile(record.images?.cover ?? null);
  }

  function resetProgress() {
    setProgress({ percent: 0, steps: [], logs: [] });
  }

  function pushLog(level: "info" | "warn" | "error", message: string, ts?: string) {
    setProgress((p) => ({
      ...p,
      logs: [...p.logs, { ts: ts ?? new Date().toISOString(), level, message }],
    }));
  }

  function bumpImageVersion(key: string) {
    const now = Date.now();
    setImageVersions((prev) => ({ ...prev, [key]: now }));
  }

  function bumpImageVersions(keys: string[]) {
    const now = Date.now();
    setImageVersions((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = now;
      return next;
    });
  }

  function applyStep(id: string, patch: Partial<ProgressStep> & { status?: StepStatus }) {
    setProgress((p) => {
      const steps = p.steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
      return { ...p, steps };
    });
  }

  function parseJson<T>(text: string): T | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function handleOutlineGenerate() {
    setError(null);
    setLoadingStep("outline");
    const res = await fetch("/api/text/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, language, textModel, imageModel, gameId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      setGameId(data.gameId);
      setOutlineText(JSON.stringify(data.outline, null, 2));
      await fetchGames();
    }
    setLoadingStep(null);
  }

  async function handleOutlineSave() {
    setError(null);
    const outline = parseJson(outlineText);
    if (!outline || !gameId) {
      setError(t('errors.outlineParseError'));
      return;
    }
    setLoadingStep("outline-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline }),
    });
    if (!res.ok) setError(t('errors.saveFailed'));
    setLoadingStep(null);
  }

  async function applyStep1Chat() {
    if (!gameId) return;
    const instruction = step1Chat.trim();
    if (!instruction) return;
    setError(null);
    setChatBusy("step1");
    try {
      if (mode === "text-adventure") {
        let outlineObj: any = null;
        try {
          outlineObj = outlineText ? JSON.parse(outlineText) : null;
        } catch {
          throw new Error(t("errors.invalidOutlineJson"));
        }
        const res = await fetch("/api/modify/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, instruction, outline: outlineObj }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data?.error || t("errors.modifyFailed"));
        setOutlineText(JSON.stringify(data.outline, null, 2));
      } else {
        let planObj: any = null;
        try {
          planObj = planText ? JSON.parse(planText) : null;
        } catch {
          throw new Error(t("errors.invalidPlanJson"));
        }
        const res = await fetch("/api/modify/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, instruction, plan: planObj }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data?.error || t("errors.modifyFailed"));
        setPlanText(JSON.stringify(data.plan, null, 2));
      }
      setStep1Chat("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setChatBusy(null);
    }
  }

  async function applyStep3Chat() {
    if (!gameId) return;
    const instruction = step3Chat.trim();
    if (!instruction) return;
    setError(null);
    setChatBusy("step3");
    try {
      const res = await fetch("/api/modify/gameHtml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, instruction, gameHtml }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || t("errors.modifyFailed"));
      setGameHtml(data.gameHtml);
      setStep3Chat("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setChatBusy(null);
    }
  }

  async function handleScenesGenerate() {
    setError(null);
    if (!gameId) {
      setError(t('errors.missingGameId'));
      return;
    }
    const outline = parseJson(outlineText);
    if (!outline) {
      setError(t('errors.scenesParseError2'));
      return;
    }
    setLoadingStep("scenes");
    const res = await fetch("/api/text/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, outline }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      setScenesText(JSON.stringify(data.scenes, null, 2));
    }
    setLoadingStep(null);
  }

  async function handleScenesSave() {
    setError(null);
    const scenes = parseJson(scenesText);
    if (!scenes || !gameId) {
      setError(t('errors.scenesParseError'));
      return;
    }
    setLoadingStep("scenes-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes }),
    });
    if (!res.ok) setError(t('errors.saveFailed'));
    setLoadingStep(null);
  }

  async function handleTextImagesGenerate() {
    setError(null);
    if (!gameId) {
      setError(t('errors.missingGameId'));
      return;
    }
    const scenes = parseJson(scenesText);
    if (!scenes) {
      setError(t('errors.scenesParseError2'));
      return;
    }
    setLoadingStep("text-images");
    const res = await fetch("/api/text/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, scenes, force: true }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      const nextScenes = data.images?.scenes ?? {};
      setImageFiles(nextScenes);
      const now = Date.now();
      setImageVersions((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(nextScenes).map((k) => [k, now])) }));
      setCoverFile(data.images?.cover ?? null);
    }
    setLoadingStep(null);
  }

  async function handleSceneImage(sceneId: string, cgPrompt: string) {
    if (!gameId) return;
    setLoadingStep(`scene-${sceneId}`);
    const res = await fetch("/api/text/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, sceneId, cgPrompt, force: true }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setImageFiles((prev) => ({ ...prev, [sceneId]: data.file }));
      setImageVersions((prev) => ({ ...prev, [sceneId]: Date.now() }));
    } else {
      setError(data.error ?? t('errors.singleSceneImageFailed'));
    }
    setLoadingStep(null);
  }

  async function handlePlanGenerate() {
    setError(null);
    setLoadingStep("plan");
    const res = await fetch("/api/side/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, language, textModel, imageModel, gameId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      setGameId(data.gameId);
      setPlanText(JSON.stringify(data.plan, null, 2));
      await fetchGames();
    }
    setLoadingStep(null);
  }

  async function handlePlanSave() {
    setError(null);
    const plan = parseJson(planText);
    if (!plan || !gameId) {
      setError(t('errors.planParseError'));
      return;
    }
    setLoadingStep("plan-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) setError(t('errors.saveFailed'));
    setLoadingStep(null);
  }

  async function handleAssetImagesGenerate() {
    setError(null);
    if (!gameId) {
      setError(t('errors.missingGameId'));
      return;
    }
    const plan = parseJson(planText);
    if (!plan) {
      setError(t('errors.planParseError2'));
      return;
    }
    setLoadingStep("asset-images");
    const res = await fetch("/api/side/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, plan, force: true }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      const nextAssets = data.assets ?? {};
      setImageFiles(nextAssets);
      const now = Date.now();
      setImageVersions((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(nextAssets).map((k) => [k, now])) }));
    }
    setLoadingStep(null);
  }

  async function handleAssetImage(assetId: string, promptText: string, needsCutout: boolean) {
    if (!gameId) return;
    setLoadingStep(`asset-${assetId}`);
    const res = await fetch("/api/side/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, assetId, prompt: promptText, needsCutout, force: true }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setImageFiles((prev) => ({ ...prev, [assetId]: data.file }));
      setImageVersions((prev) => ({ ...prev, [assetId]: Date.now() }));
    } else {
      setError(data.error ?? t('errors.singleAssetImageFailed'));
    }
    setLoadingStep(null);
  }

  async function handleSideGameGenerate() {
    if (!gameId) return;
    setLoadingStep("side-game");
    const res = await fetch("/api/side/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? t('errors.generateFailed'));
    } else {
      setGameHtml(data.gameHtml ?? "");
    }
    setLoadingStep(null);
  }

  async function handleSideGameSave() {
    if (!gameId) return;
    setLoadingStep("side-game-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameHtml }),
    });
    if (!res.ok) setError(t('errors.saveFailed'));
    setLoadingStep(null);
  }

  async function handleStep1Modify() {
    if (!gameId) {
      setError(t('errors.missingGameId'));
      return;
    }
    const instruction = step1Chat.trim();
    if (!instruction) return;

    try {
      setChatBusy('step1');
      setError(null);

      if (mode === 'text-adventure') {
        let outlineObj: any;
        try {
          outlineObj = JSON.parse(outlineText);
        } catch {
          setError(t('errors.outlineParseError2'));
          return;
        }
        const res = await fetch('/api/modify/outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, instruction, outline: outlineObj }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setError(data?.error || t('errors.modifyFailed'));
          return;
        }
        setOutlineText(JSON.stringify(data.outline, null, 2));
      } else {
        let planObj: any;
        try {
          planObj = JSON.parse(planText);
        } catch {
          setError(t('errors.planParseError2'));
          return;
        }
        const res = await fetch('/api/modify/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, instruction, plan: planObj }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setError(data?.error || t('errors.modifyFailed'));
          return;
        }
        setPlanText(JSON.stringify(data.plan, null, 2));
      }

      setStep1Chat('');
    } catch (e: any) {
      setError(e?.message || t('errors.modifyFailed'));
    } finally {
      setChatBusy(null);
    }
  }

  async function handleStep3Modify() {
    if (!gameId) {
      setError(t('errors.missingGameId'));
      return;
    }
    const instruction = step3Chat.trim();
    if (!instruction) return;
    try {
      setChatBusy('step3');
      setError(null);
      const res = await fetch('/api/modify/gameHtml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, instruction, gameHtml }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || t('errors.modifyFailed'));
        return;
      }
      setGameHtml(String(data.gameHtml || ''));
      setStep3Chat('');
    } catch (e: any) {
      setError(e?.message || t('errors.modifyFailed'));
    } finally {
      setChatBusy(null);
    }
  }

  async function handleOneClick() {
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStreaming(true);
    resetProgress();

    try {
      const fd = new FormData();
      fd.set("mode", mode);
      fd.set("language", language);
      fd.set("prompt", prompt);
      fd.set("textModel", textModel);
      fd.set("imageModel", imageModel);
      if (gameId) fd.set("gameId", gameId);

      const res = await fetch("/api/generate-stream", { method: "POST", body: fd, signal: ac.signal });
      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            pushLog("warn", `Unparsable chunk: ${trimmed.slice(0, 200)}`);
            continue;
          }

          if (evt.type === "init") {
            setProgress((p) => ({
              ...p,
              steps: evt.steps.map((s) => ({ id: s.id, title: s.title, status: "pending" as StepStatus })),
            }));
          } else if (evt.type === "log") {
            pushLog((evt.level ?? "info") as any, evt.message, evt.ts);
          } else if (evt.type === "step") {
            if (typeof evt.percent === "number") setProgress((p) => ({ ...p, percent: evt.percent! }));
            applyStep(evt.id, { status: evt.status, message: evt.message });
          } else if (evt.type === "result") {
            if (evt.result?.gameId) {
              setGameId(evt.result.gameId);
              await loadGame(evt.result.gameId);
            }
          } else if (evt.type === "fatal") {
            setError(evt.error);
            pushLog("error", evt.error);
          }
	      }
	    }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        pushLog("warn", t('errors.cancelled'));
      } else {
        setError(e?.message ?? String(e));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      await fetchGames();
    }
  }

  async function handleDownload() {
    if (!gameId) return;
    const res = await fetch(`/api/export/${gameId}`);
    if (!res.ok) {
      setError(t('errors.downloadFailed'));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-${gameId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const parsedScenes = parseJson<any>(scenesText);
  const parsedPlan = parseJson<any>(planText);
  const sceneList = Array.isArray(parsedScenes?.scenes) ? parsedScenes.scenes : [];
  const assetList = Array.isArray(parsedPlan?.assets) ? parsedPlan.assets : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-3 flex justify-between items-start">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-sm text-text/70">{t('subtitle')}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="max-w-3xl text-text/80">
            {t('description')}
          </p>
        </div>
        <LanguageSelector />
      </header>

      <div className="grid gap-6 md:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('generateConsole')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              tabs={[
                { key: "text-adventure", label: t('textAdventureLabel') },
                { key: "side-scroller", label: t('sideScrollerLabel') },
              ]}
            />

            <div className="grid gap-2">
              <Label>{t('ideaPrompt')}</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder={t('promptPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{tc('language')}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-panel2 px-3 py-2 text-sm outline-none"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t('textModel')}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-panel2 px-3 py-2 text-sm outline-none"
                  value={textModel}
                  onChange={(e) => setTextModel(e.target.value)}
                >
                  {TEXT_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 col-span-2">
                <Label>{t('imageModel')}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-panel2 px-3 py-2 text-sm outline-none"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleOneClick} disabled={streaming} className="flex-1">
                {streaming ? t('generating') : t('generateOneClick')}
              </Button>
              {streaming ? (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  {tc('cancel')}
                </Button>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl border border-border bg-panel2 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-text/70">
              <div>{t('currentGameId')}：{gameId ?? t('notGenerated')}</div>
              <div className="mt-1 flex gap-2">
                {gameId ? (
                  <>
                    <a className="underline" href={`/game/${gameId}`} target="_blank" rel="noreferrer">{t('tryPlay')}</a>
                    <button className="underline" onClick={handleDownload}>{t('downloadZip')}</button>
                  </>
                ) : (
                  <span>{t('generateThenPlay')}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('stepByStep')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {streaming ? (
              <GenerationProgress
                percent={progress.percent}
                steps={progress.steps}
                logs={progress.logs}
                running={true}
                onCancel={() => abortRef.current?.abort()}
                labels={{
                  processTitle: t('progress.generatingOutline'),
                  progress: t('progress.generatingOutline'),
                  cancel: tc('cancel'),
                  logsTitle: t('progress.generatingOutline'),
                  waiting: t('generating')
                }}
              />
            ) : progress.steps.length ? (
              <details className="rounded-2xl border border-border bg-panel2 p-4">
                <summary className="cursor-pointer select-none text-sm font-medium">{t('viewLogs')}</summary>
                <div className="mt-4">
                  <GenerationProgress percent={progress.percent} steps={progress.steps} logs={progress.logs} running={false} labels={{
                    processTitle: t('progress.generatingOutline'),
                    progress: t('progress.generatingOutline'),
                    cancel: tc('cancel'),
                    logsTitle: t('progress.generatingOutline'),
                    waiting: t('generating')
                  }} />
                </div>
              </details>
            ) : null}

            {mode === "text-adventure" ? (
              <>
                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step1')}: {t('textAdventure.step1Title')}</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleOutlineGenerate} disabled={loadingStep === "outline"}>
                        {loadingStep === "outline" ? t('generating') : t('textAdventure.generateOutline')}
                      </Button>
                      <Button variant="ghost" onClick={handleOutlineSave} disabled={loadingStep === "outline-save"}>
                        {t('textAdventure.saveChanges')}
                      </Button>
                    </div>
                  </div>
                  <Textarea value={outlineText} onChange={(e) => setOutlineText(e.target.value)} rows={8} />
                  <div className="rounded-xl border border-border bg-panel1 p-3 space-y-2">
                    <div className="text-xs text-text/70">{t('incrementalEditLabel')}</div>
                    <div className="flex gap-2 items-end">
                      <Textarea
                        value={step1Chat}
                        onChange={(e) => setStep1Chat(e.target.value)}
                        rows={2}
                        placeholder={t('incrementalEditPlaceholder')}
                      />
                      <Button
                        variant="ghost"
                        onClick={applyStep1Chat}
                        disabled={chatBusy === "step1" || !gameId}
                      >
                        {chatBusy === "step1" ? t('applying') : t('apply')}
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step2')}: {t('textAdventure.step2Title')}</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleScenesGenerate} disabled={loadingStep === "scenes"}>
                        {loadingStep === "scenes" ? t('generating') : t('textAdventure.generateScenes')}
                      </Button>
                      <Button variant="ghost" onClick={handleScenesSave} disabled={loadingStep === "scenes-save"}>
                        {t('textAdventure.saveChanges')}
                      </Button>
                    </div>
                  </div>
                  <Textarea value={scenesText} onChange={(e) => setScenesText(e.target.value)} rows={10} />
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step3')}: {t('textAdventure.step3Title')}</div>
                    <Button variant="ghost" onClick={handleTextImagesGenerate} disabled={loadingStep === "text-images"}>
                      {loadingStep === "text-images" ? t('generating') : t('textAdventure.generateAllImages')}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {sceneList.length === 0 ? (
                      <div className="text-xs text-text/70">{t('textAdventure.generateScenesFirst')}</div>
                    ) : (
                      sceneList.map((scene: any) => {
                        const file = imageFiles[scene.id];
                        return (
                          <div key={scene.id} className="rounded-xl border border-border p-3">
                            <div className="text-sm font-medium">{scene.title} ({scene.id})</div>
                            <div className="text-xs text-text/70 mt-1">{scene.cgPrompt}</div>
                            {file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className="mt-2 rounded-lg border border-border"
                                src={`/api/assets/${gameId}/${file}?v=${imageVersions[scene.id] ?? 0}`}
                                alt={scene.title}
                              />
                            ) : null}
                            <div className="mt-2">
                              <Button variant="ghost" onClick={() => handleSceneImage(scene.id, scene.cgPrompt)} disabled={loadingStep === `scene-${scene.id}`}>{t('textAdventure.singleSceneRetry')}</Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step1')}: {t('sideScroller.step1Title')}</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handlePlanGenerate} disabled={loadingStep === "plan"}>
                        {loadingStep === "plan" ? t('generating') : t('sideScroller.generatePlan')}
                      </Button>
	                      <Button variant="ghost" onClick={handlePlanSave} disabled={loadingStep === "plan-save"}>
                        {t('sideScroller.saveChanges')}
                      </Button>
                    </div>
                  </div>
                  <Textarea value={planText} onChange={(e) => setPlanText(e.target.value)} rows={10} />
                  <div className="rounded-xl border border-border bg-panel1 p-3 space-y-2">
                    <div className="text-xs text-text/70">{t('incrementalEditLabel')}</div>
                    <div className="flex gap-2 items-end">
                      <Textarea
                        value={step1Chat}
                        onChange={(e) => setStep1Chat(e.target.value)}
                        rows={2}
                        placeholder={t('incrementalEditPlaceholder')}
                      />
                      <Button
                        variant="ghost"
                        onClick={applyStep1Chat}
                        disabled={chatBusy === "step1" || !gameId}
                      >
                        {chatBusy === "step1" ? t('applying') : t('apply')}
                      </Button>
                    </div>
                    <div className="text-[11px] text-text/60">{t('incrementalEditHint')}</div>
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step2')}: {t('sideScroller.step2Title')}</div>
                    <Button variant="ghost" onClick={handleAssetImagesGenerate} disabled={loadingStep === "asset-images"}>
                      {loadingStep === "asset-images" ? t('generating') : t('sideScroller.generateAllAssets')}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {assetList.length === 0 ? (
                      <div className="text-xs text-text/70">{t('sideScroller.generatePlanFirst')}</div>
                    ) : (
                      assetList.map((asset: any) => {
                        const file = imageFiles[asset.id];
                        return (
                          <div key={asset.id} className="rounded-xl border border-border p-3">
                            <div className="text-sm font-medium">{asset.id} ({asset.type})</div>
                            <div className="text-xs text-text/70 mt-1">{asset.prompt}</div>
                            <div className="text-xs text-text/60 mt-1">{t('transparentRequired')}：{asset.needsCutout ? t('textAdventure.transparentRequired') : t('textAdventure.transparentNotRequired')}</div>
                            {file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className="mt-2 rounded-lg border border-border"
                                src={`/api/assets/${gameId}/${file}?v=${imageVersions[asset.id] ?? 0}`}
                                alt={asset.id}
                              />
                            ) : null}
                            <div className="mt-2">
                              <Button variant="ghost" onClick={() => handleAssetImage(asset.id, asset.prompt, asset.needsCutout)} disabled={loadingStep === `asset-${asset.id}`}>{t('sideScroller.singleAssetRetry')}</Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('step3')}: {t('sideScroller.step3Title')}</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleSideGameGenerate} disabled={loadingStep === "side-game"}>
                        {loadingStep === "side-game" ? t('generating') : t('sideScroller.generateGame')}
                      </Button>
                      <Button variant="ghost" onClick={handleSideGameSave} disabled={loadingStep === "side-game-save"}>
                        {t('sideScroller.saveChanges')}
                      </Button>
                    </div>
                  </div>
                  <Textarea value={gameHtml} onChange={(e) => setGameHtml(e.target.value)} rows={6} placeholder={t('sideScroller.htmlPlaceholder')} />
                  <div className="rounded-xl border border-border bg-panel1 p-3 space-y-2">
                    <div className="text-xs text-text/70">{t('incrementalEditLabel')}</div>
                    <div className="flex gap-2 items-end">
                      <Textarea
                        value={step3Chat}
                        onChange={(e) => setStep3Chat(e.target.value)}
                        rows={2}
                        placeholder={t('incrementalEditPlaceholder')}
                      />
                      <Button
                        variant="ghost"
                        onClick={applyStep3Chat}
                        disabled={chatBusy === "step3" || !gameId}
                      >
                        {chatBusy === "step3" ? t('applying') : t('apply')}
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-panel2 p-4">
        <div className="font-medium mb-3">{t('history.title')}</div>
        {games.length === 0 ? (
          <div className="text-xs text-text/70">{t('history.noRecords')}</div>
        ) : (
          <div className="grid gap-2">
            {games.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
                <div>
                  <div className="font-medium">{g.title || g.id}</div>
                  <div className="text-text/60">{g.mode} · {new Date(g.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => loadGame(g.id)}>{tc('open')}</Button>
                  <a className="text-text/70 underline" href={`/game/${g.id}`} target="_blank" rel="noreferrer">{t('tryPlay')}</a>
                  <Button variant="ghost" onClick={() => handleDeleteGame(g.id)}>{tc('delete')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </main>
  );
}
