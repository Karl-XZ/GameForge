"use client";

import * as React from "react";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type ProgressStep = {
  id: string;
  title: string;
  status: StepStatus;
  message?: string;
};

export type LogEntry = {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
};

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "done") return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />;
  if (status === "running") return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />;
  if (status === "skipped") return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-text/30" />;
  if (status === "error") return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />;
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-text/20" />;
}

export function GenerationProgress(props: {
  percent: number;
  steps: ProgressStep[];
  logs: LogEntry[];
  running: boolean;
  onCancel?: () => void;
  labels?: {
    processTitle?: string;
    progress?: string;
    cancel?: string;
    logsTitle?: string;
    waiting?: string;
  };
}) {
  const {
    processTitle = "生成过程",
    progress = "进度",
    cancel = "取消",
    logsTitle = "实时日志",
    waiting = "等待开始..."
  } = props.labels || {};
  
  const logRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [props.logs.length]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-panel2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">{processTitle}</div>
          {props.running && props.onCancel ? (
            <button
              onClick={props.onCancel}
              className="rounded-xl border border-border bg-panel px-3 py-1.5 text-xs text-text/80 hover:bg-panel2"
              type="button"
            >
              {cancel}
            </button>
          ) : null}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-text/70">
            <span>{progress}</span>
            <span>{Math.max(0, Math.min(100, Math.round(props.percent)))}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, props.percent))}%` }}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {props.steps.map((s) => (
            <div key={s.id} className="flex items-start gap-3 rounded-xl border border-border bg-panel px-3 py-2">
              <div className="mt-1"><StatusDot status={s.status} /></div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.title}</div>
                {s.message ? <div className="mt-0.5 text-xs text-text/70 break-words">{s.message}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-panel2 p-4">
        <div className="text-sm font-medium">{logsTitle}</div>
        <div
          ref={logRef}
          className="mt-3 max-h-72 overflow-auto rounded-xl border border-border bg-panel px-3 py-2 font-mono text-xs leading-relaxed"
        >
          {props.logs.length ? (
            props.logs.map((l, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words">
                <span className="text-text/50">[{new Date(l.ts).toLocaleTimeString()}]</span>{" "}
                <span className={l.level === "error" ? "text-red-200" : l.level === "warn" ? "text-amber-200" : "text-text/80"}>
                  {l.message}
                </span>
              </div>
            ))
          ) : (
            <div className="text-text/60">{waiting}</div>
          )}
        </div>
      </div>
    </div>
  );
}
