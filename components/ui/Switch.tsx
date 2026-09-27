"use client";

import { cn } from "./utils";

const SIZE_STYLE = {
  sm: { track: "h-5 w-8", knob: "size-3.5", translate: "translate-x-3" },
  md: { track: "h-6 w-10", knob: "size-4", translate: "translate-x-4" },
  lg: { track: "h-7 w-12", knob: "size-5", translate: "translate-x-5" },
} as const;

export interface SwitchProps {
  on: boolean;
  onToggle: () => void;
  size?: keyof typeof SIZE_STYLE;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ on, onToggle, size = "md", label, disabled = false, className }: SwitchProps) {
  const dims = SIZE_STYLE[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center rounded-full border border-transparent p-0.5 transition-[background-color,box-shadow] motion-reduce:transition-none", dims.track)} style={{ backgroundColor: on ? "var(--color-primary)" : "var(--control-muted)" }}>
        <span className={cn("rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none", dims.knob, on && dims.translate)} />
      </span>
    </button>
  );
}
