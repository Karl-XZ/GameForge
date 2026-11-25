import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plate", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-4 bg-jet px-6 py-3 text-snow", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("heavy text-[17px]", className)} {...props} />;
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
  const styles = { primary: "btn-ink", accent: "btn-red", ghost: "btn-quiet", danger: "btn-quiet !text-pop hover:!bg-pop hover:!text-snow" }[variant];
  return <button className={cn(styles, className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("field resize-y leading-relaxed", props.className)} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("font-cond text-[13px] font-bold uppercase tracking-[0.08em] text-jet", className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tag", className)} {...props} />;
}

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-[3px] w-full bg-jet", className)} {...props} />;
}

/** Segmented control: slanted slabs, the active one inverted with a red drop. */
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
    <div className="flex flex-wrap gap-2 pl-1">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={active}
            className={cn(
              "-skew-x-[8deg] border-[2.5px] border-jet px-4 py-2 font-cond text-[15px] font-extrabold italic tracking-[0.03em] transition",
              active ? "bg-jet text-snow shadow-hard-red" : "bg-snow text-jet hover:bg-volt"
            )}
          >
            <span className="inline-block skew-x-[8deg]">{t.label}</span>
            {t.badge ? <span className="ml-1.5 font-mono text-[11px] opacity-70">{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Brand mark: a slanted red slab carrying a white branching lineage, one tip in yellow. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M7 2h23l-5 28H2z" fill="#E8132E" stroke="#0B0B0D" strokeWidth="2" strokeLinejoin="miter" />
      <path d="M15 26V18M15 18L9.5 11.5M15 18l6-7M9.5 11.5V7M21 11l2.4-4.4" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="square" />
      <circle cx="15" cy="26.4" r="2.3" fill="#FFFFFF" />
      <circle cx="9.5" cy="6.4" r="2" fill="#FFFFFF" />
      <circle cx="23.6" cy="6.2" r="2.7" fill="#FFE135" stroke="#0B0B0D" strokeWidth="1.2" />
    </svg>
  );
}

/** Section header that sits directly on the red ground. */
export function SectionTitle({ no, title, kicker, aside }: { no: string; title: React.ReactNode; kicker?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex items-end gap-4">
        <span className="outline-num font-display text-[64px] leading-[0.8] md:text-[84px]">{no}</span>
        <div className="pb-1">
          {kicker ? <div className="tag mb-2">{kicker}</div> : null}
          <h2 className="shout slant text-[34px] leading-none md:text-[44px]">{title}</h2>
        </div>
      </div>
      {aside}
    </div>
  );
}
