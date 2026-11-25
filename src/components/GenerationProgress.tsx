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
  if (status === "done") return <span className="flex h-5 w-5 -skew-x-[8deg] items-center justify-center bg-jet font-mono text-[11px] font-semibold text-snow">✓</span>;
  if (status === "running") return <span className="breathe flex h-5 w-5 -skew-x-[8deg] items-center justify-center bg-pop font-mono text-[11px] text-snow">▶</span>;
  if (status === "skipped") return <span className="flex h-5 w-5 items-center justify-center font-mono text-[12px] text-ink3">–</span>;
  if (status === "error") return <span className="flex h-5 w-5 -skew-x-[8deg] items-center justify-center bg-volt font-mono text-[11px] font-semibold text-jet">✕</span>;
  return <span className="h-5 w-5 -skew-x-[8deg] border-2 border-jet/30" />;
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
        <div className="flex items-end justify-between gap-3">
          <div className="tag">{processTitle}</div>
          <div className="flex items-end gap-3">
            <span className="font-display text-[44px] leading-[0.85] num">{pct}<span className="text-[22px] text-pop">%</span></span>
            {props.running && props.onCancel ? <button onClick={props.onCancel} className="btn-quiet py-1.5 text-[13px]" type="button">{cancel}</button> : null}
          </div>
        </div>
        <div className="mt-3 h-4 w-full -skew-x-[12deg] border-[2.5px] border-jet bg-snow" aria-label={progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full transition-[width] duration-500 ${props.running ? "marching" : "bg-pop"}`} style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 space-y-1.5">
          {props.steps.map((s, i) => (
            <li key={s.id} className={`grid grid-cols-[30px_22px_1fr] items-center gap-2 border-l-[5px] py-1.5 pl-2 ${s.status === "running" ? "border-pop bg-pop/[0.06]" : s.status === "done" ? "border-jet" : "border-fog"}`}>
              <span className="font-display text-[15px] text-ink3 num">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex justify-center"><StatusDot status={s.status} /></span>
              <div className="min-w-0">
                <div className={`text-[14px] ${s.status === "running" ? "font-bold text-jet" : s.status === "pending" ? "text-ink3" : "font-medium text-ink2"}`}>{s.title}</div>
                {s.message ? <div className="mt-0.5 break-words text-[12px] text-ink3">{s.message}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <div className="eyebrow mb-2">{logsTitle}</div>
        <div ref={logRef} className="halftone-white max-h-60 overflow-auto border-[3px] border-jet bg-jet px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-snow/85">
          {props.logs.length ? (
            props.logs.map((l, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words">
                <span className="text-snow/40">{new Date(l.ts).toLocaleTimeString()}</span>{" "}
                <span className={l.level === "error" ? "text-[#FF6B7D]" : l.level === "warn" ? "text-volt" : ""}>{l.message}</span>
              </div>
            ))
          ) : (
            <div className="text-snow/50">{waiting}</div>
          )}
        </div>
      </div>
    </div>
  );
}
