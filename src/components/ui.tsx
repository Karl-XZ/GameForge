import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-panel/70 shadow-glow backdrop-blur",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-3", className)} {...props} />;
}

export function Button(
  { className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger";
  }
) {
  const styles = {
    primary: "bg-primary text-black hover:brightness-110",
    ghost: "bg-white/0 hover:bg-white/5 text-text border border-border",
    danger: "bg-danger text-black hover:brightness-110",
  }[variant];

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        styles,
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-panel2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-panel2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40",
        props.className
      )}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm text-muted", className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-white/5 px-2 py-0.5 text-xs text-muted",
        className
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-border", className)} {...props} />;
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string; badge?: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-border bg-panel2 p-1">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative rounded-xl px-3 py-2 text-sm transition",
              active ? "bg-white/10 text-text" : "text-muted hover:bg-white/5"
            )}
          >
            <span className="flex items-center gap-2">
              {t.label}
              {t.badge ? <span className={cn("text-xs", active ? "text-text" : "text-muted")}>({t.badge})</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
