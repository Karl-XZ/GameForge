"use client";

import * as React from "react";
import { ImprovementPanel } from "@/components/ImprovementPanel";
import { DarwinHub, type HubTab } from "@/components/darwin/DarwinHub";
import { useLocale, useTranslations } from 'next-intl';
import { Button, Label, Textarea, Tabs, Mark, SectionTitle } from "@/components/ui";
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
  prompt?: string;
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

  const [mode, setMode] = React.useState<Mode>("side-scroller");
  const [tab, setTab] = React.useState<"forge" | HubTab>("forge");
  const [autoEvolve, setAutoEvolve] = React.useState(true);
  const [stats, setStats] = React.useState<any>(null);
  const [language, setLanguage] = React.useState<"zh" | "en">(() => (uiLocale === 'en' ? 'en' : 'zh'));
  const [prompt, setPrompt] = React.useState<string>(() => t('promptPlaceholder'));
  const [textModel, setTextModel] = React.useState<string>(TEXT_MODELS[0]);
  const [assetMode,setAssetMode]=React.useState<'canvas'|'background'|'full'>('canvas');
  const [imageModel, setImageModel] = React.useState<string>(IMAGE_MODELS[0]);

  const [availableModels,setAvailableModels]=React.useState({text:TEXT_MODELS,image:IMAGE_MODELS});
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
    | { type: "game"; gameId: string }
    | { type: "fatal"; error: string };

  React.useEffect(() => {
    fetchGames();
    fetch('/api/evolve').then(r=>r.json()).then(setStats).catch(()=>{});
    fetch('/api/models').then(r=>r.json()).then(m=>{setAvailableModels(m);setTextModel(m.defaultText);setImageModel(m.defaultImage);}).catch(()=>{});
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
      setError((await res.json().catch(()=>null))?.error || t('errors.deleteFailed'));
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
    const assetCount=Object.keys(record.images?.assets||{}).length;setAssetMode(assetCount===0?'canvas':assetCount===1?'background':'full');
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
      body: JSON.stringify({ prompt, language, textModel, imageModel, gameId, visualMode:assetMode==='canvas'?'canvas':undefined,assetLimit:assetMode==='background'?1:undefined }),
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
      body: JSON.stringify({ prompt, language, textModel, imageModel, gameId, visualMode:assetMode==='canvas'?'canvas':undefined,assetLimit:assetMode==='background'?1:undefined }),
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
      if(mode==="side-scroller"){if(assetMode==="canvas")fd.set("visualMode","canvas");if(assetMode==="background")fd.set("assetLimit","1");}
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

          if (evt.type === "game") {setGameId(evt.gameId);continue;}
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
              if (autoEvolve && mode === "side-scroller") {
                const r = await fetch(`/api/improve/${evt.result.gameId}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: "evolve", requestId: crypto.randomUUID(), goal: uiLocale === 'zh' ? '让新玩家更快理解目标，跳跃手感更好，节奏更紧凑，同时让游戏更有个性。' : 'Clearer goals, better jump feel, tighter pacing, more personality.', constraints: uiLocale === 'zh' ? '改动不设上限，可以重做画面、玩法和关卡；必须遵守技术约定（单文件、GameAgentBridge、真实键盘操作），不得作弊。' : 'No limit on the size of a change; the technical contract (single file, GameAgentBridge, real keyboard input) holds; no cheats.', budgets: {generations: 3, children: 4, teamMinutes: 25, calls: 160, minutes: 300, episodes: 3}})});
                if (r.ok) setTab("galaxy"); else pushLog("warn", (await r.json().catch(() => null))?.error || "evolution did not start");
              }
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

  const zhUI = uiLocale === 'zh';
  const L = (a: string, b: string) => (zhUI ? a : b);
  const NAV = [["forge", "工坊", "Forge"], ["galaxy", "谱系", "Lineage"], ["specimen", "标本", "Specimen"], ["cabinet", "标本柜", "Cabinet"], ["observatory", "观察台", "Society"], ["method", "方法", "Method"]] as const;
  const PIPE = [
    [L('制作', 'Make'), L('从七类基因中选一个方向，只做少量精确编辑，并通过语法校验', 'One of seven genes, a few exact edits, a syntax check')],
    [L('试玩', 'Play'), L('萌新、速通、探索三种 AI 玩家在沙箱里真实按键', 'Newbie, speedrunner and explorer press real keys in a sandbox')],
    [L('评审', 'Review'), L('与上一代做两次盲评，第二次对调 A、B 顺序', 'Two blind reviews against the parent, order swapped')],
    [L('社会', 'Society'), L('40 位模拟玩家发帖、打分、弃坑，口碑扩散 7 天', '40 simulated players post, rate, quit; seven days of word of mouth')],
    [L('选择', 'Select'), L('适应度 + 生态位档案；冠军必须赢下两次盲评', 'Fitness plus niche archive; a champion must win both reviews')],
  ];
  const stepHead = (n: number, title: string, actions?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-12 -skew-x-[10deg] items-center justify-center bg-pop font-display text-[24px] text-snow shadow-hard-sm num">{n}</span>
        <h3 className="heavy text-[18px]">{title}</h3>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
  const editRow = (value: string, set: (v: string) => void, onApply: () => void, busyKey: string, hint?: string) => (
    <div className="space-y-2 border-l-[5px] border-jet bg-bone p-3 md:ml-[60px]">
      <div className="eyebrow text-jet">{t('incrementalEditLabel')}</div>
      <div className="flex items-end gap-3">
        <Textarea value={value} onChange={(e) => set(e.target.value)} rows={2} placeholder={t('incrementalEditPlaceholder')} />
        <Button variant="ghost" onClick={onApply} disabled={chatBusy === busyKey || !gameId} className="mb-1 shrink-0 py-2.5">
          {chatBusy === busyKey ? t('applying') : t('apply')}
        </Button>
      </div>
      {hint ? <div className="text-[12px] text-ink3">{hint}</div> : null}
    </div>
  );
  const codeArea = "field font-mono text-[12.5px] leading-[1.65] bg-bone";
  const progressLabels = {
    processTitle: L('生成过程', 'Generation'),
    progress: L('进度', 'Progress'),
    cancel: tc('cancel'),
    logsTitle: L('实时日志', 'Live log'),
    waiting: t('generating'),
  };
  const statTiles = stats?.ok ? [[stats.games, L('款游戏进入进化', 'games evolved')], [stats.species, L('个物种诞生', 'species born')], [stats.alive, L('个存活', 'alive')], [stats.calls, L('次模型调用', 'model calls')]] : [];

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b-[4px] border-jet bg-jet text-snow">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 px-5 md:h-[64px] md:flex-nowrap md:px-10">
          <button onClick={() => setTab("forge")} className="group flex h-14 shrink-0 items-center gap-2.5 md:h-auto" aria-label="GameForge">
            <span className="transition group-hover:-rotate-6"><Mark size={34} /></span>
            <span className="slant font-display text-[28px] uppercase leading-none tracking-[0.01em]">Game<span className="text-pop">Forge</span></span>
            <span className="tag tag-red ml-1 hidden sm:inline-flex"><span>{L('达尔文进化', 'Darwin')}</span></span>
          </button>
          <nav className="order-3 -mx-5 flex h-12 w-[calc(100%+2.5rem)] items-center gap-1 overflow-x-auto border-t-2 border-snow/10 px-4 md:order-none md:mx-0 md:h-full md:w-auto md:border-0 md:px-2">
            {NAV.map(([key, zh, en], i) => {
              const on = tab === key;
              return (
                <button key={key} onClick={() => setTab(key as any)} aria-current={on ? 'page' : undefined} className={`group relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 transition ${on ? 'text-jet' : 'text-snow/75 hover:text-snow'}`}>
                  <span className={`absolute inset-0 -skew-x-[14deg] transition-transform duration-200 ${on ? 'scale-x-100 bg-snow shadow-[4px_4px_0_#E8132E]' : 'origin-left scale-x-0 bg-pop group-hover:scale-x-100'}`} />
                  <span className={`relative font-display text-[13px] num ${on ? 'text-pop' : 'text-snow/40 group-hover:text-snow'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={`relative ${zhUI ? 'heavy text-[15px]' : 'font-cond text-[17px] font-extrabold uppercase italic tracking-[0.03em]'}`}>{zhUI ? zh : en}</span>
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-5">
            {stats?.ok && <div className="hidden items-center gap-3 font-mono text-[11px] text-snow/60 num xl:flex">
              <span><b className="text-snow">{stats.species}</b> {L('物种', 'species')}</span><span className="text-pop">/</span><span><b className="text-snow">{stats.alive}</b> {L('存活', 'alive')}</span><span className="text-pop">/</span><span><b className="text-snow">{stats.calls}</b> {L('调用', 'calls')}</span>
            </div>}
            <LanguageSelector />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-24 md:px-10">
      {tab !== "forge" && <div className="fade-up"><DarwinHub gameId={gameId} games={games} onPickGame={async (id) => { await loadGame(id); }} locale={uiLocale} tab={tab as HubTab} setTab={setTab as any} onApplied={() => gameId && loadGame(gameId)} gameTitle={(parseJson<any>(planText)?.title) || prompt.slice(0, 40)} /></div>}

      {tab === "forge" && <>
      <section className="grid items-start gap-12 pb-16 pt-12 lg:grid-cols-12 lg:pt-16">
        <div className="stagger lg:col-span-7">
          <div className="tag tag-white"><span>{L('工坊 · 一句话到可玩游戏', 'The forge · one sentence to a playable game')}</span></div>
          {zhUI
            ? <h1 className="mt-7 text-[38px] leading-[1.12] sm:text-[52px] md:text-[84px]">
                <span className="shout block -skew-x-[6deg]">一句话锻造游戏，</span>
                <span className="mt-3 flex flex-wrap items-center gap-x-3 md:mt-4">
                  <span className="shout -skew-x-[6deg]">再让它</span>
                  <span className="ransom heavy -skew-x-[6deg]"><span>自</span><span>己</span><span>进</span><span>化</span></span>
                </span>
              </h1>
            : <h1 className="mt-7 font-display text-[54px] uppercase leading-[0.95] md:text-[100px]">
                <span className="block -skew-x-[6deg] text-snow [text-shadow:5px_5px_0_#0B0B0D]">Forge a game</span>
                <span className="block -skew-x-[6deg] text-snow [text-shadow:5px_5px_0_#0B0B0D]">from one line.</span>
                <span className="mt-3 inline-flex -skew-x-[6deg] items-center gap-3"><span className="text-snow [text-shadow:5px_5px_0_#0B0B0D]">Then let it</span><span className="ransom"><span>E</span><span>V</span><span>O</span><span>L</span><span>V</span><span>E</span></span></span>
              </h1>}
          <div className="bubble mt-10 max-w-[620px] border-[3px] border-jet bg-snow px-6 py-5 shadow-hard">
            <p className="text-[16px] leading-[1.85] text-ink2">{L('GameForge 把一句想法变成能离线运行的 HTML 游戏。达尔文进化把它当作第 0 代：每个后代都要被 AI 玩家真实试玩、被盲评、被模拟玩家社会讨论，只有拿出证据的后代才能继续繁衍。', 'GameForge turns an idea into an offline HTML game. Darwin Evolution treats it as generation 0: every offspring is really played by AI players, blindly reviewed and discussed by a simulated player society, and only offspring with evidence reproduce.')}</p>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-5">
            <a href="#workbench" className="btn-ink px-6 py-3.5 text-[18px]">{L('开始锻造', 'Start forging')} <span aria-hidden>↓</span></a>
            <button onClick={() => setTab('galaxy')} className="btn-line px-6 py-3.5 text-[18px]">{L('看进化谱系', 'See the lineage')} <span aria-hidden>→</span></button>
          </div>
        </div>
        <aside className="relative lg:col-span-5 lg:mt-6">
          <div className="plate-dark halftone-white relative rotate-[-1.2deg] px-6 pb-6 pt-9">
            <div className="tag tag-volt absolute -top-4 left-5 rotate-[-3deg] text-[14px]"><span>{L('一代是怎样产生的', 'How one generation is made')}</span></div>
            <div className="absolute right-5 top-4 font-mono text-[11px] text-snow/50">≈ 6 {L('次调用 / 后代', 'calls / child')}</div>
            <ol className="stagger mt-2">
              {PIPE.map(([k, d], i) => (
                <li key={k} className="group grid grid-cols-[56px_1fr] items-center gap-3 border-b-2 border-snow/10 py-3.5 last:border-0">
                  <span className="outline-num font-display text-[44px] leading-none transition group-hover:text-pop group-hover:[-webkit-text-stroke:0]">{i + 1}</span>
                  <span>
                    <span className="heavy block text-[20px] leading-tight">{k}</span>
                    <span className="mt-0.5 block text-[13px] leading-6 text-snow/65">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-l-[4px] border-pop pl-3 text-[12px] leading-6 text-snow/60">{L('原版若在试玩中崩溃，真实报错会交给一次「修复突变」，修好的版本成为新的起点。', 'If the original crashes in play, the real error goes to a repair mutation and the fixed build becomes the new root.')}</p>
          </div>
        </aside>
      </section>

      {statTiles.length > 0 && <section className="grid grid-cols-2 gap-5 pb-16 md:grid-cols-4 md:gap-6">
        {statTiles.map(([v, k], i) => (
          <div key={i} className={`-skew-x-[6deg] border-[3px] border-jet px-6 py-5 ${i % 2 ? 'bg-jet text-snow shadow-hard-white md:translate-y-4' : 'bg-snow shadow-hard'}`}>
            <div className="skew-x-[6deg]">
              <div className={`font-display text-[56px] leading-none num md:text-[72px] ${i % 2 ? 'text-snow' : 'text-pop'}`}>{v}</div>
              <div className={`mt-2 heavy text-[14px] ${i % 2 ? 'text-snow/70' : 'text-ink2'}`}>{k}</div>
            </div>
          </div>
        ))}
      </section>}

      <section id="workbench" className="scroll-mt-24 pt-6">
        <SectionTitle no="01" kicker={L('一键 / 逐步', 'One click / step by step')} title={L('锻造台', 'Workbench')}
          aside={<p className="max-w-md bg-jet px-4 py-2.5 text-[13px] leading-6 text-snow/80">{L('一键生成会依次完成素材清单、素材和游戏代码；也可以在右侧逐步生成、手动修改。', 'One click runs the plan, assets and game code in order; or step through on the right and edit by hand.')}</p>} />
        <div className="plate grid shadow-hard-lg lg:grid-cols-[410px_minmax(0,1fr)]">
          <div className="space-y-6 border-b-[3px] border-jet bg-snow p-6 md:p-7 lg:border-b-0 lg:border-r-[3px]">
            <div className="-mx-6 -mt-6 flex items-center justify-between bg-jet px-6 py-3 text-snow md:-mx-7 md:-mt-7 md:px-7">
              <h3 className="heavy text-[17px]">{t('generateConsole')}</h3>
              <span className="tag tag-red"><span>{gameId ? `#${gameId.slice(0, 8)}` : L('新游戏', 'NEW')}</span></span>
            </div>
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
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder={t('promptPlaceholder')} className="text-[15px] leading-[1.75]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{tc('language')}</Label>
                <select className="field" value={language} onChange={(e) => setLanguage(e.target.value as any)}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t('textModel')}</Label>
                <select className="field font-mono text-[12px]" value={textModel} onChange={(e) => setTextModel(e.target.value)}>
                  {availableModels.text.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="col-span-2 grid gap-2">
                <Label>{t('imageModel')}</Label>
                <select className="field font-mono text-[12px]" value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                  {availableModels.image.length === 0 && <option value="">{L('未配置生图模型', 'No image model configured')}</option>}
                  {availableModels.image.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {mode === 'side-scroller' && <div className="grid gap-2">
              <Label>{L('视觉素材', 'Visual assets')}<span className="ml-1 font-sans text-[12px] font-normal normal-case tracking-normal text-ink3">{L('（影响耗时与费用）', '(affects time and cost)')}</span></Label>
              <select aria-label={L('视觉素材', 'Visual assets')} className="field" value={assetMode} onChange={e => setAssetMode(e.target.value as any)}>
                <option value="canvas">{L('原生绘制：优先验证玩法，无需生图', 'Canvas: test gameplay without image calls')}</option>
                <option value="background">{L('生成一张背景，其余原生绘制', 'One generated background, Canvas characters')}</option>
                <option value="full">{L('生成完整素材清单（耗时和费用较高）', 'Generate full asset list (higher time/cost)')}</option>
              </select>
            </div>}
            {mode === 'side-scroller' && <label className={`flex cursor-pointer items-start gap-3 border-[2.5px] border-jet p-4 transition ${autoEvolve ? 'bg-volt' : 'bg-snow hover:bg-bone'}`}>
              <input type="checkbox" className="tick mt-0.5" checked={autoEvolve} onChange={e => setAutoEvolve(e.target.checked)} />
              <span>
                <span className="heavy block text-[15px]">{L('生成后立即开始达尔文进化', 'Start Darwin evolution right after')}</span>
                <span className="mt-1 block text-[12px] leading-5 text-ink2">{L('3 代，每代 4 个 dsh 制作组按真实评价自由修改；真实试玩、严苛评审、双盲评、玩家社会', '3 generations × 4 dsh studios changing freely from real reviews; real playtests, harsh critic, blind reviews, player society')}</span>
              </span>
            </label>}
            <div className="flex gap-3 pt-1">
              <Button variant="accent" onClick={handleOneClick} disabled={streaming} className="flex-1 py-4 text-[20px]">
                {streaming ? <><span className="breathe">■</span> {t('generating')}</> : <>{t('generateOneClick')} <span aria-hidden>→</span></>}
              </Button>
              {streaming ? <Button variant="ghost" onClick={() => abortRef.current?.abort()}>{tc('cancel')}</Button> : null}
            </div>
            {error ? <div role="alert" className="border-[2.5px] border-jet bg-volt px-3 py-2.5 text-[13px] font-semibold leading-6 text-jet">{error}</div> : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-jet/25 pt-4 text-[12px] text-ink3">
              <span>{t('currentGameId')} <span className="font-mono text-jet">{gameId ?? t('notGenerated')}</span></span>
              {gameId ? <span className="flex shrink-0 gap-3">
                <a className="link text-jet" href={`/game/${gameId}`} target="_blank" rel="noreferrer">{t('tryPlay')} ↗</a>
                <button className="link text-jet" onClick={handleDownload}>{t('downloadZip')}</button>
              </span> : null}
            </div>
          </div>

          <div className="min-w-0 bg-snow p-6 md:p-7">
            <div className="mb-7 flex items-center justify-between">
              <h3 className="heavy slant text-[22px]">{t('stepByStep')}</h3>
              <span className="tag"><span>{mode === 'side-scroller' ? L('横版动作', 'SIDE-SCROLLER') : L('文字冒险', 'TEXT ADVENTURE')}</span></span>
            </div>
            {streaming ? (
              <div className="mb-8 border-[2.5px] border-jet bg-bone p-4"><GenerationProgress percent={progress.percent} steps={progress.steps} logs={progress.logs} running={true} onCancel={() => abortRef.current?.abort()} labels={progressLabels} /></div>
            ) : progress.steps.length ? (
              <details className="mb-8 border-[2.5px] border-jet px-4 py-3">
                <summary className="cursor-pointer select-none font-cond text-[14px] font-extrabold uppercase italic">{t('viewLogs')}</summary>
                <div className="mt-4"><GenerationProgress percent={progress.percent} steps={progress.steps} logs={progress.logs} running={false} labels={progressLabels} /></div>
              </details>
            ) : null}

            <div className="space-y-9">
            {mode === "text-adventure" ? (
              <>
                <section className="space-y-4">
                  {stepHead(1, t('textAdventure.step1Title'), <>
                    <Button variant="ghost" onClick={handleOutlineGenerate} disabled={loadingStep === "outline"}>{loadingStep === "outline" ? t('generating') : t('textAdventure.generateOutline')}</Button>
                    <Button variant="ghost" onClick={handleOutlineSave} disabled={loadingStep === "outline-save"}>{t('textAdventure.saveChanges')}</Button>
                  </>)}
                  <textarea className={codeArea} value={outlineText} onChange={(e) => setOutlineText(e.target.value)} rows={8} />
                  {editRow(step1Chat, setStep1Chat, applyStep1Chat, "step1")}
                </section>
                <section className="space-y-4">
                  {stepHead(2, t('textAdventure.step2Title'), <>
                    <Button variant="ghost" onClick={handleScenesGenerate} disabled={loadingStep === "scenes"}>{loadingStep === "scenes" ? t('generating') : t('textAdventure.generateScenes')}</Button>
                    <Button variant="ghost" onClick={handleScenesSave} disabled={loadingStep === "scenes-save"}>{t('textAdventure.saveChanges')}</Button>
                  </>)}
                  <textarea className={codeArea} value={scenesText} onChange={(e) => setScenesText(e.target.value)} rows={10} />
                </section>
                <section className="space-y-4">
                  {stepHead(3, t('textAdventure.step3Title'), <Button variant="ghost" onClick={handleTextImagesGenerate} disabled={loadingStep === "text-images"}>{loadingStep === "text-images" ? t('generating') : t('textAdventure.generateAllImages')}</Button>)}
                  <div className="grid gap-4 md:ml-[60px] md:grid-cols-2">
                    {sceneList.length === 0 ? <div className="text-[13px] text-ink3">{t('textAdventure.generateScenesFirst')}</div> : sceneList.map((scene: any) => {
                      const file = imageFiles[scene.id];
                      return (
                        <figure key={scene.id} className="border-[2.5px] border-jet bg-snow p-3 shadow-hard-sm">
                          {file ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="mb-3 w-full border-2 border-jet" src={`/api/assets/${gameId}/${file}?v=${imageVersions[scene.id] ?? 0}`} alt={scene.title} />
                          ) : <div className="hatch mb-3 aspect-video w-full border-2 border-jet" />}
                          <figcaption className="heavy text-[14px]">{scene.title} <span className="font-mono text-[10px] font-normal text-ink3">{scene.id}</span></figcaption>
                          <div className="mt-1 line-clamp-3 text-[12px] leading-5 text-ink3">{scene.cgPrompt}</div>
                          <Button variant="ghost" className="mt-3" onClick={() => handleSceneImage(scene.id, scene.cgPrompt)} disabled={loadingStep === `scene-${scene.id}`}>{t('textAdventure.singleSceneRetry')}</Button>
                        </figure>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="space-y-4">
                  {stepHead(1, t('sideScroller.step1Title'), <>
                    <Button variant="ghost" onClick={handlePlanGenerate} disabled={loadingStep === "plan"}>{loadingStep === "plan" ? t('generating') : t('sideScroller.generatePlan')}</Button>
                    <Button variant="ghost" onClick={handlePlanSave} disabled={loadingStep === "plan-save"}>{t('sideScroller.saveChanges')}</Button>
                  </>)}
                  <textarea className={codeArea} value={planText} onChange={(e) => setPlanText(e.target.value)} rows={9} placeholder={L('素材清单（JSON）会显示在这里，可直接编辑。', 'The asset plan (JSON) appears here and can be edited.')} />
                  {editRow(step1Chat, setStep1Chat, applyStep1Chat, "step1", t('incrementalEditHint'))}
                </section>
                <section className="space-y-4">
                  {stepHead(2, t('sideScroller.step2Title'), <Button variant="ghost" onClick={handleAssetImagesGenerate} disabled={loadingStep === "asset-images"}>{loadingStep === "asset-images" ? t('generating') : t('sideScroller.generateAllAssets')}</Button>)}
                  <div className="grid gap-4 md:ml-[60px] md:grid-cols-2">
                    {assetList.length === 0 ? <div className="text-[13px] text-ink3">{t('sideScroller.generatePlanFirst')}</div> : assetList.map((asset: any) => {
                      const file = imageFiles[asset.id];
                      return (
                        <figure key={asset.id} className="border-[2.5px] border-jet bg-snow p-3 shadow-hard-sm">
                          {file ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="mb-3 max-h-48 w-full border-2 border-jet bg-bone object-contain" src={`/api/assets/${gameId}/${file}?v=${imageVersions[asset.id] ?? 0}`} alt={asset.id} />
                          ) : null}
                          <figcaption className="heavy text-[14px]">{asset.id} <span className="font-mono text-[10px] font-normal text-ink3">{asset.type}</span></figcaption>
                          <div className="mt-1 line-clamp-3 text-[12px] leading-5 text-ink3">{asset.prompt}</div>
                          <div className="mt-1 text-[11px] text-ink3">{t('transparentRequired')}：{asset.needsCutout ? t('textAdventure.transparentRequired') : t('textAdventure.transparentNotRequired')}</div>
                          <Button variant="ghost" className="mt-3" onClick={() => handleAssetImage(asset.id, asset.prompt, asset.needsCutout)} disabled={loadingStep === `asset-${asset.id}`}>{t('sideScroller.singleAssetRetry')}</Button>
                        </figure>
                      );
                    })}
                  </div>
                </section>
                <section className="space-y-4">
                  {stepHead(3, t('sideScroller.step3Title'), <>
                    <Button variant="ghost" onClick={handleSideGameGenerate} disabled={loadingStep === "side-game"}>{loadingStep === "side-game" ? t('generating') : t('sideScroller.generateGame')}</Button>
                    <Button variant="ghost" onClick={handleSideGameSave} disabled={loadingStep === "side-game-save"}>{t('sideScroller.saveChanges')}</Button>
                  </>)}
                  <textarea className={codeArea} value={gameHtml} onChange={(e) => setGameHtml(e.target.value)} rows={6} placeholder={t('sideScroller.htmlPlaceholder')} />
                  {editRow(step3Chat, setStep3Chat, applyStep3Chat, "step3")}
                </section>
              </>
            )}
            </div>
          </div>
        </div>
      </section>

      <section className="pt-20">
        <SectionTitle no="02" kicker={`${games.length} ${L('款', 'games')}`} title={L('作品库', 'Library')} />
        {games.length === 0 ? (
          <div className="plate py-12 text-center text-[14px] text-ink3">{t('history.noRecords')}</div>
        ) : (
          <div className="plate overflow-hidden">
            <div className="hidden grid-cols-[72px_minmax(0,1fr)_130px_150px_auto] gap-6 bg-jet px-5 py-2.5 font-cond text-[13px] font-extrabold uppercase italic tracking-[0.08em] text-snow md:grid">
              <span>No.</span><span>{L('作品', 'Title')}</span><span>{L('类型', 'Mode')}</span><span>{L('创建时间', 'Created')}</span><span className="text-right">{L('操作', 'Actions')}</span>
            </div>
            {games.map((g, i) => {
              const on = g.id === gameId;
              return (
                <div key={g.id} className={`group relative grid items-center gap-x-6 gap-y-3 border-b-2 border-jet/10 px-5 py-5 transition last:border-0 md:grid-cols-[72px_minmax(0,1fr)_130px_150px_auto] ${on ? 'bg-volt/60' : 'hover:bg-bone'}`}>
                  <span className={`absolute bottom-0 left-0 top-0 w-[7px] origin-left transition-transform ${on ? 'scale-x-100 bg-pop' : 'scale-x-0 bg-jet group-hover:scale-x-100'}`} />
                  <span className={`font-display text-[30px] leading-none num ${on ? 'text-pop' : 'text-jet/25 group-hover:text-jet'}`}>{String(games.length - i).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="heavy truncate text-[20px]">{g.title || g.id}</div>
                    <div className="mt-1 line-clamp-1 text-[13px] text-ink3">{g.prompt}</div>
                  </div>
                  <span><span className={`tag ${g.mode === 'side-scroller' ? 'tag-red' : ''}`}><span>{g.mode === 'side-scroller' ? t('sideScrollerLabel') : t('textAdventureLabel')}</span></span></span>
                  <span className="font-mono text-[11px] text-ink3 num">{new Date(g.createdAt).toLocaleString(zhUI ? 'zh-CN' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {g.mode === 'side-scroller' && <Button variant="accent" className="py-1.5" onClick={async () => { await loadGame(g.id); setTab('galaxy'); }}>{L('进化', 'Evolve')} →</Button>}
                    <Button variant="ghost" className="py-1.5" onClick={() => loadGame(g.id)}>{tc('open')}</Button>
                    <a className="btn-quiet py-1.5" href={`/game/${g.id}`} target="_blank" rel="noreferrer">{t('tryPlay')} ↗</a>
                    <button className="px-2 py-1.5 font-cond text-[13px] font-bold uppercase text-ink3 transition hover:text-pop" onClick={() => handleDeleteGame(g.id)}>{tc('delete')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {gameId && mode === "side-scroller" && <div className="pt-20"><ImprovementPanel key={gameId} gameId={gameId} locale={uiLocale} onApply={() => loadGame(gameId)} /></div>}
      </>}
      </main>

      <footer className="relative border-t-[4px] border-jet bg-jet text-snow">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[12px] text-snow/60 md:px-10">
          <div className="flex items-center gap-2.5"><Mark size={22} /><span className="slant font-display text-[18px] uppercase text-snow">Game<span className="text-pop">Forge</span></span><span>· {L('游戏锻造与达尔文进化', 'forge & Darwin evolution')}</span></div>
          <div className="border-l-[4px] border-pop pl-3">{L('模型评审与模拟玩家社会都是代理信号，不等于真人觉得好玩。', 'Model reviews and the simulated society are proxies, not human enjoyment.')}</div>
        </div>
      </footer>
    </div>
  );
}
