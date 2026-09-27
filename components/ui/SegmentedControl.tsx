"use client";

import { cn } from "./utils";

export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: { options: { label: string; value: T; disabled?: boolean }[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex rounded-(--radius-app) border border-(--control-border) bg-(--surface-muted) p-1 text-xs", className)}>
      {options.map((option) => <button key={option.value} type="button" disabled={option.disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("min-h-11 min-w-max flex-1 whitespace-nowrap rounded-[calc(var(--radius-app)-3px)] px-2 py-1.5 font-medium outline-none transition focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0", value === option.value ? "bg-(--surface-app) text-(--color-primary-ink) shadow-sm" : "text-(--text-muted) hover:text-foreground")}>{option.label}</button>)}
    </div>
  );
}
