"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./utils";

export interface DropdownOption { value: string; label: string; disabled?: boolean }
type DropdownVariant = "filter" | "form" | "header";
type DropdownAlign = "left" | "right";

const TRIGGER_STYLE: Record<DropdownVariant, string> = {
  filter: "h-8 rounded-lg px-2.5 text-xs font-medium",
  form: "flex h-9 w-full items-center justify-between rounded-(--radius-app) px-3 text-[13px]",
  header: "h-8.5 rounded-(--radius-app) px-3 text-xs font-semibold",
};
const MENU_WIDTH: Record<DropdownVariant, string> = { filter: "w-44", form: "w-full", header: "w-36" };

function normalizeOptions(options: DropdownOption[] | string[]): DropdownOption[] {
  return options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[] | string[];
  onChange: (value: string) => void;
  variant?: DropdownVariant;
  align?: DropdownAlign;
  prefix?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Dropdown({ value, options, onChange, variant = "filter", align = "left", prefix, label, disabled = false, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const normalized = normalizeOptions(options);
  const currentLabel = normalized.find((option) => option.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", keyboard); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const options = menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)');
    const selected = Array.from(options ?? []).find((option) => option.getAttribute("aria-selected") === "true");
    (selected ?? options?.[0])?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? []);
    if (!options.length) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    }
  };

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className={cn("relative", variant === "form" && "w-full", className)}
    >
      <button ref={triggerRef} type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((state) => !state)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }} className={cn("inline-flex min-h-11 items-center gap-1.5 border border-(--control-border) bg-(--control-bg) outline-none transition hover:bg-(--control-hover) focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0", TRIGGER_STYLE[variant])}>
        <span className="truncate">{prefix ? `${prefix}: ` : ""}{currentLabel}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} role="listbox" aria-label={label} onKeyDown={handleMenuKeyDown} className={cn("absolute top-full z-(--layer-popover) mt-1 max-h-60 overflow-y-auto rounded-(--radius-app) border border-(--control-border) bg-(--surface-app) p-1 shadow-(--shadow-panel)", MENU_WIDTH[variant], align === "right" ? "right-0" : "left-0")}>
          {normalized.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={value === option.value} tabIndex={-1} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[calc(var(--radius-app)-3px)] px-2.5 py-2 text-left text-xs outline-none hover:bg-(--control-hover) focus-visible:bg-(--control-hover) disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0" style={{ paddingBlock: "calc(0.5rem * var(--density-scale))" }}>
              <span className={cn("truncate", value === option.value && "font-semibold text-(--color-primary-ink)")}>{option.label}</span>
              {value === option.value ? <Check size={14} className="shrink-0 text-(--color-primary-ink)" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
