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
  if (status === "done") return <span className="font-mono text-[12px] text-verdigris">✓</span>;
  if (status === "running") return <span className="breathe inline-block h-2 w-2 rounded-full bg-vermilion" />;
  if (status === "skipped") return <span className="font-mono text-[12px] text-ink3">–</span>;
  if (status === "error") return <span className="font-mono text-[12px] text-vermilion">✕</span>;
  return <span className="inline-block h-2 w-2 rounded-full border border-ink3/60" />;
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

  const pct = Math.max(0, Math.min(100, Math.round(props.percent)));
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[13px] font-medium">{processTitle}</div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[28px] leading-none num">{pct}<span className="text-[16px] text-ink3">%</span></span>
            {props.running && props.onCancel ? <button onClick={props.onCancel} className="btn-quiet py-1 text-[12px]" type="button">{cancel}</button> : null}
          </div>
        </div>
        <div className="mt-3 h-[3px] w-full bg-rule" aria-label={progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 divide-y divide-rule border-y border-rule">
          {props.steps.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[28px_18px_1fr] items-baseline gap-2 py-2.5">
              <span className="font-mono text-[10px] text-ink3 num">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex justify-center"><StatusDot status={s.status} /></span>
              <div className="min-w-0">
                <div className={`text-[13px] ${s.status === "running" ? "font-medium text-ink" : s.status === "pending" ? "text-ink3" : "text-ink2"}`}>{s.title}</div>
                {s.message ? <div className="mt-0.5 break-words text-[12px] text-ink3">{s.message}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <div className="eyebrow mb-2">{logsTitle}</div>
        <div ref={logRef} className="max-h-60 overflow-auto bg-ink px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-paper/85">
          {props.logs.length ? (
            props.logs.map((l, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words">
                <span className="text-paper/40">{new Date(l.ts).toLocaleTimeString()}</span>{" "}
                <span className={l.level === "error" ? "text-[#F2A38C]" : l.level === "warn" ? "text-[#E9C77B]" : ""}>{l.message}</span>
              </div>
            ))
          ) : (
            <div className="text-paper/50">{waiting}</div>
          )}
        </div>
      </div>
    </div>
  );
}
