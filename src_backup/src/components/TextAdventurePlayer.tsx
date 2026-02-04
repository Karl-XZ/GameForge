"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { TextAdventureScenes } from "@/lib/schemas";

export function TextAdventurePlayer({ data }: { data: TextAdventureScenes }) {
  const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
  const sceneById = React.useMemo(() => {
    const m = new Map<string, TextAdventureScenes["scenes"][number]>();
    for (const s of scenes) m.set(String(s.id), s);
    return m;
  }, [scenes]);

  const [sceneId, setSceneId] = React.useState<string>(() => String(data?.startingSceneId ?? scenes?.[0]?.id ?? ""));
  const [history, setHistory] = React.useState<string[]>([]);

  const scene = sceneById.get(sceneId);

  React.useEffect(() => {
    setSceneId(String(data?.startingSceneId ?? scenes?.[0]?.id ?? ""));
    setHistory([]);
  }, [data, scenes]);

  if (!scene) {
    return (
      <div className="rounded-2xl border border-border bg-panel2 p-4 text-sm text-text/70">
        没有可用的场景数据，请重新生成。
      </div>
    );
  }

  const isEnding = !!scene.isEnding || (scene.choices?.length ?? 0) === 0;
  const endingLabel =
    scene.endingType === "win" ? "成功" : scene.endingType === "fail" ? "失败" : "收束";

  return (
    <Card className="bg-panel/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{data.title}</CardTitle>
            <p className="mt-1 text-xs text-text/70">{data.setting} · {data.tone}</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setSceneId(String(data?.startingSceneId ?? scenes?.[0]?.id ?? ""));
              setHistory([]);
            }}
          >
            重开
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-panel2 p-4">
          <div className="text-sm font-medium mb-1">{scene.title}</div>
          <div className="text-sm leading-relaxed text-text/85 whitespace-pre-wrap">
            {scene.text ?? (scene as any).description ?? ""}
          </div>
        </div>

        {isEnding ? (
          <div className="rounded-xl border border-border bg-panel2 p-4 text-sm">
            <div className="font-medium mb-1">结局：{endingLabel}</div>
            <div className="text-text/80 whitespace-pre-wrap">
              {scene.endingText?.trim() ? scene.endingText : "故事结束。你可以重开或生成新的设定。"}
            </div>
          </div>
        ) : null}

        {!isEnding ? (
          <div className="grid gap-2">
            {(scene.choices ?? []).map((c, idx) => (
              <Button
                key={`${sceneId}-${idx}`}
                variant="primary"
                onClick={() => {
                  const next = String(c.nextSceneId);
                  setHistory((h) => [...h, String(sceneId)]);
                  setSceneId(next);
                }}
              >
                {c.text}
              </Button>
            ))}
            {(scene.choices?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-text/70">
                当前场景没有可用选项。你可以点击“重开”或重新生成。
              </div>
            ) : null}
          </div>
        ) : null}

        {history.length ? (
          <details className="rounded-xl border border-border bg-panel2 p-3 text-xs text-text/70">
            <summary className="cursor-pointer select-none">路径历史</summary>
            <ol className="mt-2 list-decimal pl-4">
              {history.map((id, idx) => (
                <li key={`${id}-${idx}`}>{sceneById.get(id)?.title ?? id}</li>
              ))}
            </ol>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
