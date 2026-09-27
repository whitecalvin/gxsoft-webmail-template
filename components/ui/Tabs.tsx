"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./utils";

export interface TabOption<T extends string = string> { value: T; label: ReactNode; disabled?: boolean; badge?: ReactNode }

export function Tabs<T extends string>({ value, options, onChange, label, variant = "underline", className }: { value: T; options: TabOption<T>[]; onChange: (value: T) => void; label: string; variant?: "underline" | "pills"; className?: string }) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((option, i) => ({ option, i })).filter(({ option }) => !option.disabled);
    const current = enabled.findIndex((item) => item.i === index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
    const target = enabled[next];
    if (target) { onChange(target.option.value); refs.current[target.i]?.focus(); }
  };
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-center", variant === "pills" ? "gap-1 rounded-(--radius-app) bg-(--surface-muted) p-1" : "gap-5 border-b border-(--border-app)", className)}>
      {options.map((option, index) => { const selected = option.value === value; return (
        <button key={option.value} ref={(node) => { refs.current[index] = node; }} id={`${id}-tab-${option.value}`} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} disabled={option.disabled} onClick={() => onChange(option.value)} onKeyDown={(event) => navigate(event, index)} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium outline-none transition focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:opacity-45", variant === "pills" ? "rounded-[calc(var(--radius-app)-3px)] px-3 py-1.5" : "-mb-px border-b px-0.5 py-2.5", selected ? variant === "pills" ? "bg-(--surface-app) text-(--color-primary-ink) shadow-sm" : "border-(--color-primary) text-(--color-primary-ink)" : variant === "pills" ? "text-(--text-muted) hover:text-foreground" : "border-transparent text-(--text-muted) hover:border-(--border-app) hover:text-foreground")} style={{ paddingBlock: `calc(${variant === "pills" ? "0.375rem" : "0.625rem"} * var(--density-scale))` }}>{option.label}{option.badge}</button>
      ); })}
    </div>
  );
}

export function TabPanel({ value, activeValue, children, className }: { value: string; activeValue: string; children: ReactNode; className?: string }) {
  if (value !== activeValue) return null;
  return <div role="tabpanel" className={className}>{children}</div>;
}
