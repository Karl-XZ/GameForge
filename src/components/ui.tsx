import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plate", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-baseline justify-between gap-4 border-b border-rule px-6 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-serif text-[17px] font-semibold text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-ink3", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function Button(
  { className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger" | "accent";
  }
) {
  const styles = { primary: "btn-ink", accent: "btn-red", ghost: "btn-quiet", danger: "btn-line !border-vermilion !text-vermilion hover:!bg-vermilion hover:!text-paper" }[variant];
  return <button className={cn(styles, className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("field resize-y leading-relaxed", props.className)} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[12px] font-medium text-ink2", className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink3", className)} {...props} />;
}

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-rule", className)} {...props} />;
}

/** Segmented control drawn as a ruled strip. */
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
    <div className="inline-flex border border-ink/80">
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "px-4 py-2 text-[13px] transition",
              i > 0 && "border-l border-ink/80",
              active ? "bg-ink text-paper" : "text-ink2 hover:bg-ink/5"
            )}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 font-mono text-[11px] opacity-70">{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Small brand mark: a branching lineage sketch, one branch inked in vermilion. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 29V18M16 18L8 10M16 18l8-8M8 10V5M8 10l-4-3M24 10l3-4M24 10v-1" fill="none" stroke="#1B1A17" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="29" r="2.2" fill="#1B1A17" />
      <circle cx="8" cy="4.5" r="1.9" fill="#1B1A17" />
      <circle cx="3.6" cy="6.6" r="1.6" fill="#1B1A17" />
      <circle cx="27.4" cy="5.4" r="1.6" fill="#1B1A17" />
      <circle cx="24" cy="8.4" r="2.4" fill="#B8401F" />
    </svg>
  );
}
