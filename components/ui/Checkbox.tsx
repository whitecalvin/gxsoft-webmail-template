"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "./utils";

export interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}

export function Checkbox({ checked, onChange, label, description, indeterminate = false, disabled = false, size = 16, className }: CheckboxProps) {
  const selected = checked || indeterminate;
  return (
    <label className={cn("inline-flex items-start gap-2.5", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className)}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} aria-checked={indeterminate ? "mixed" : checked} onChange={onChange} />
      <span aria-hidden="true" className="mt-0.5 flex shrink-0 items-center justify-center rounded-[4px] border transition motion-reduce:transition-none peer-focus-visible:ring-3 peer-focus-visible:ring-(--focus-ring)" style={{ height: size, width: size, borderColor: selected ? "var(--color-primary-solid)" : "var(--control-border)", backgroundColor: selected ? "var(--color-primary-solid)" : "var(--control-bg)" }}>
        {indeterminate ? <Minus size={Math.round(size * 0.68)} strokeWidth={3} className="text-white" /> : checked ? <Check size={Math.round(size * 0.68)} strokeWidth={3} className="text-white" /> : null}
      </span>
      <span className={cn("min-w-0", !description && "sr-only")}>
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-(--text-muted)">{description}</span> : null}
      </span>
    </label>
  );
}
