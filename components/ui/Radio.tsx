"use client";

import { cn } from "./utils";

export interface RadioOption { value: string; label: string; description?: string; disabled?: boolean }

export function RadioGroup({ name, value, options, onChange, label, orientation = "vertical", disabled = false, className }: { name: string; value: string; options: RadioOption[]; onChange: (value: string) => void; label: string; orientation?: "horizontal" | "vertical"; disabled?: boolean; className?: string }) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className={cn("flex gap-3", orientation === "vertical" ? "flex-col" : "flex-wrap")}>
        {options.map((option) => (
          <label key={option.value} className={cn("inline-flex items-start gap-2.5", option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} className="peer sr-only" />
            <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-(--control-border) bg-(--control-bg) transition motion-reduce:transition-none peer-checked:border-(--color-primary-ink) peer-focus-visible:ring-3 peer-focus-visible:ring-(--focus-ring)">
              <span className={cn("size-2 rounded-full bg-(--color-primary) transition-opacity", value === option.value ? "opacity-100" : "opacity-0")} />
            </span>
            <span><span className="block text-sm font-medium">{option.label}</span>{option.description ? <span className="mt-0.5 block text-xs text-(--text-muted)">{option.description}</span> : null}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
