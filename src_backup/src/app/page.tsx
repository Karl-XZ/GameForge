"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Tabs } from "@/components/ui";
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

export default function Home() {
  const [mode, setMode] = React.useState<Mode>("text-adventure");
  const [language, setLanguage] = React.useState<"zh" | "en">("zh");
  const [prompt, setPrompt] = React.useState<string>("赛博朋克高科技低生活的未来都市，一次危险的数据窃取任务。包含随机事件与道德抉择。");
  const [textModel, setTextModel] = React.useState<string>(TEXT_MODELS[0]);
  const [imageModel, setImageModel] = React.useState<string>(IMAGE_MODELS[0]);

  const [gameId, setGameId] = React.useState<string | null>(null);
  const [outlineText, setOutlineText] = React.useState<string>("");
  const [scenesText, setScenesText] = React.useState<string>("");
  const [planText, setPlanText] = React.useState<string>("");
  const [gameHtml, setGameHtml] = React.useState<string>("");

  const [loadingStep, setLoadingStep] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [games, setGames] = React.useState<GameSummary[]>([]);
  const [imageFiles, setImageFiles] = React.useState<Record<string, string>>({});
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
    const ok = window.confirm("确定删除这个游戏吗？此操作不可撤销。");
    if (!ok) return;
    const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("删除失败");
      return;
    }
    if (gameId === id) {
      setGameId(null);
      setOutlineText("");
      setScenesText("");
      setPlanText("");
      setGameHtml("");
      setImageFiles({});
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
    setImageFiles(record.images?.scenes ?? record.images?.assets ?? {});
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
      setError(data.error ?? "生成失败");
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
      setError("大纲 JSON 无法解析或缺少 gameId");
      return;
    }
    setLoadingStep("outline-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline }),
    });
    if (!res.ok) setError("保存失败");
    setLoadingStep(null);
  }

  async function handleScenesGenerate() {
    setError(null);
    if (!gameId) {
      setError("请先生成大纲");
      return;
    }
    const outline = parseJson(outlineText);
    if (!outline) {
      setError("大纲 JSON 无法解析");
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
      setError(data.error ?? "生成失败");
    } else {
      setScenesText(JSON.stringify(data.scenes, null, 2));
    }
    setLoadingStep(null);
  }

  async function handleScenesSave() {
    setError(null);
    const scenes = parseJson(scenesText);
    if (!scenes || !gameId) {
      setError("分幕 JSON 无法解析或缺少 gameId");
      return;
    }
    setLoadingStep("scenes-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes }),
    });
    if (!res.ok) setError("保存失败");
    setLoadingStep(null);
  }

  async function handleTextImagesGenerate() {
    setError(null);
    if (!gameId) {
      setError("缺少 gameId");
      return;
    }
    const scenes = parseJson(scenesText);
    if (!scenes) {
      setError("分幕 JSON 无法解析");
      return;
    }
    setLoadingStep("text-images");
    const res = await fetch("/api/text/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, scenes }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? "生成失败");
    } else {
      setImageFiles(data.images?.scenes ?? {});
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
      body: JSON.stringify({ gameId, sceneId, cgPrompt }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setImageFiles((prev) => ({ ...prev, [sceneId]: data.file }));
    } else {
      setError(data.error ?? "单幕出图失败");
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
      setError(data.error ?? "生成失败");
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
      setError("素材清单 JSON 无法解析或缺少 gameId");
      return;
    }
    setLoadingStep("plan-save");
    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) setError("保存失败");
    setLoadingStep(null);
  }

  async function handleAssetImagesGenerate() {
    setError(null);
    if (!gameId) {
      setError("缺少 gameId");
      return;
    }
    const plan = parseJson(planText);
    if (!plan) {
      setError("素材清单 JSON 无法解析");
      return;
    }
    setLoadingStep("asset-images");
    const res = await fetch("/api/side/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, plan }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error ?? "生成失败");
    } else {
      setImageFiles(data.assets ?? {});
    }
    setLoadingStep(null);
  }

  async function handleAssetImage(assetId: string, promptText: string, needsCutout: boolean) {
    if (!gameId) return;
    setLoadingStep(`asset-${assetId}`);
    const res = await fetch("/api/side/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, assetId, prompt: promptText, needsCutout }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setImageFiles((prev) => ({ ...prev, [assetId]: data.file }));
    } else {
      setError(data.error ?? "单素材出图失败");
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
      setError(data.error ?? "生成失败");
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
    if (!res.ok) setError("保存失败");
    setLoadingStep(null);
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
          const t = line.trim();
          if (!t) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(t);
          } catch {
            pushLog("warn", `Unparsable chunk: ${t.slice(0, 200)}`);
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
        pushLog("warn", "已取消");
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
      setError("下载失败");
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
      <header className="mb-8 space-y-3">
        <div className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-sm text-text/70">Gemini GameForge · Vercel Ready</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Gemini GameForge</h1>
        <p className="max-w-3xl text-text/80">
          分步编辑 + 一键生成的游戏工坊。支持文字冒险/跑团与横版动作原型，自动打包为可离线运行的 zip。
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>生成控制台</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              tabs={[
                { key: "text-adventure", label: "文字冒险 / 跑团" },
                { key: "side-scroller", label: "横版动作" },
              ]}
            />

            <div className="grid gap-2">
              <Label>创意 / 需求</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder="例如：赛博朋克 + 跑团事件 + 多结局..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>语言</Label>
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
                <Label>文本模型</Label>
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
                <Label>生图模型</Label>
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
                {streaming ? "生成中..." : "一键生成到底"}
              </Button>
              {streaming ? (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  取消
                </Button>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl border border-border bg-panel2 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-text/70">
              <div>当前 Game ID：{gameId ?? "(未生成)"}</div>
              <div className="mt-1 flex gap-2">
                {gameId ? (
                  <>
                    <a className="underline" href={`/game/${gameId}`} target="_blank" rel="noreferrer">试玩</a>
                    <button className="underline" onClick={handleDownload}>下载 zip</button>
                  </>
                ) : (
                  <span>生成后可下载与试玩</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分步流程</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {streaming ? (
              <GenerationProgress
                percent={progress.percent}
                steps={progress.steps}
                logs={progress.logs}
                running={true}
                onCancel={() => abortRef.current?.abort()}
              />
            ) : progress.steps.length ? (
              <details className="rounded-2xl border border-border bg-panel2 p-4">
                <summary className="cursor-pointer select-none text-sm font-medium">查看一键生成日志</summary>
                <div className="mt-4">
                  <GenerationProgress percent={progress.percent} steps={progress.steps} logs={progress.logs} running={false} />
                </div>
              </details>
            ) : null}

            {mode === "text-adventure" ? (
              <>
                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">步骤 1：剧情大纲</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleOutlineGenerate} disabled={loadingStep === "outline"}>
                        {loadingStep === "outline" ? "生成中..." : "生成大纲"}
                      </Button>
                      <Button variant="ghost" onClick={handleOutlineSave} disabled={loadingStep === "outline-save"}>
                        保存修改
                      </Button>
                    </div>
                  </div>
                  <Textarea value={outlineText} onChange={(e) => setOutlineText(e.target.value)} rows={8} />
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">步骤 2：分幕 JSON</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleScenesGenerate} disabled={loadingStep === "scenes"}>
                        {loadingStep === "scenes" ? "生成中..." : "生成分幕"}
                      </Button>
                      <Button variant="ghost" onClick={handleScenesSave} disabled={loadingStep === "scenes-save"}>
                        保存修改
                      </Button>
                    </div>
                  </div>
                  <Textarea value={scenesText} onChange={(e) => setScenesText(e.target.value)} rows={10} />
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">步骤 3：逐幕出图</div>
                    <Button variant="ghost" onClick={handleTextImagesGenerate} disabled={loadingStep === "text-images"}>
                      {loadingStep === "text-images" ? "生成中..." : "生成全部图片"}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {sceneList.length === 0 ? (
                      <div className="text-xs text-text/70">请先生成分幕 JSON。</div>
                    ) : (
                      sceneList.map((scene: any) => {
                        const file = imageFiles[scene.id];
                        return (
                          <div key={scene.id} className="rounded-xl border border-border p-3">
                            <div className="text-sm font-medium">{scene.title} ({scene.id})</div>
                            <div className="text-xs text-text/70 mt-1">{scene.cgPrompt}</div>
                            {file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="mt-2 rounded-lg border border-border" src={`/api/assets/${gameId}/${file}`} alt={scene.title} />
                            ) : null}
                            <div className="mt-2">
                              <Button variant="ghost" onClick={() => handleSceneImage(scene.id, scene.cgPrompt)} disabled={loadingStep === `scene-${scene.id}`}>单幕重试</Button>
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
                    <div className="font-medium">步骤 1：素材清单</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handlePlanGenerate} disabled={loadingStep === "plan"}>
                        {loadingStep === "plan" ? "生成中..." : "生成清单"}
                      </Button>
                      <Button variant="ghost" onClick={handlePlanSave} disabled={loadingStep === "plan-save"}>
                        保存修改
                      </Button>
                    </div>
                  </div>
                  <Textarea value={planText} onChange={(e) => setPlanText(e.target.value)} rows={10} />
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">步骤 2：素材出图</div>
                    <Button variant="ghost" onClick={handleAssetImagesGenerate} disabled={loadingStep === "asset-images"}>
                      {loadingStep === "asset-images" ? "生成中..." : "生成全部素材"}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {assetList.length === 0 ? (
                      <div className="text-xs text-text/70">请先生成素材清单。</div>
                    ) : (
                      assetList.map((asset: any) => {
                        const file = imageFiles[asset.id];
                        return (
                          <div key={asset.id} className="rounded-xl border border-border p-3">
                            <div className="text-sm font-medium">{asset.id} ({asset.type})</div>
                            <div className="text-xs text-text/70 mt-1">{asset.prompt}</div>
                            <div className="text-xs text-text/60 mt-1">透明需求：{asset.needsCutout ? "是" : "否"}</div>
                            {file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="mt-2 rounded-lg border border-border" src={`/api/assets/${gameId}/${file}`} alt={asset.id} />
                            ) : null}
                            <div className="mt-2">
                              <Button variant="ghost" onClick={() => handleAssetImage(asset.id, asset.prompt, asset.needsCutout)} disabled={loadingStep === `asset-${asset.id}`}>单素材重试</Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">步骤 3：生成游戏 HTML</div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={handleSideGameGenerate} disabled={loadingStep === "side-game"}>
                        {loadingStep === "side-game" ? "生成中..." : "生成游戏"}
                      </Button>
                      <Button variant="ghost" onClick={handleSideGameSave} disabled={loadingStep === "side-game-save"}>
                        保存修改
                      </Button>
                    </div>
                  </div>
                  <Textarea value={gameHtml} onChange={(e) => setGameHtml(e.target.value)} rows={6} placeholder="AI 生成的 HTML 将显示在这里（可编辑）。" />
                </section>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-panel2 p-4">
        <div className="font-medium mb-3">历史游戏</div>
        {games.length === 0 ? (
          <div className="text-xs text-text/70">暂无记录</div>
        ) : (
          <div className="grid gap-2">
            {games.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
                <div>
                  <div className="font-medium">{g.title || g.id}</div>
                  <div className="text-text/60">{g.mode} · {new Date(g.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => loadGame(g.id)}>打开</Button>
                  <a className="text-text/70 underline" href={`/game/${g.id}`} target="_blank" rel="noreferrer">试玩</a>
                  <Button variant="ghost" onClick={() => handleDeleteGame(g.id)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-10 text-xs text-text/60">
        <p>提示：部署到 Vercel 后，记得设置 <code>GEMINI_API_KEY</code> 和可选的模型环境变量。</p>
      </footer>
    </main>
  );
}
