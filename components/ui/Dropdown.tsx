"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./utils";
import styles from "./Dropdown.module.css";
import { Tooltip } from "./Tooltip";

export interface DropdownOption { value: string; label: string; icon?: ReactNode; disabled?: boolean }
type DropdownVariant = "filter" | "form" | "header";
type DropdownAlign = "left" | "right";
const DropdownPolicy = createContext<{ align: DropdownAlign; contentWidth: boolean }>({ align: "left", contentWidth: false });
const SETTINGS_POLICY = { align: "right", contentWidth: true } as const;
export function SettingsDropdownPolicy({ children }: { children: ReactNode }) {
  return <DropdownPolicy.Provider value={SETTINGS_POLICY}>{children}</DropdownPolicy.Provider>;
}

const TRIGGER_STYLE: Record<DropdownVariant, string> = {
  filter: "rounded-lg px-2.5 text-xs font-medium",
  form: "flex w-full items-center justify-between rounded-(--radius-app) px-3 text-[13px]",
  header: "rounded-(--radius-app) px-3 text-xs font-semibold",
};

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
  overlay?: boolean;
  menuMinWidth?: number;
  hideScrollbar?: boolean;
  iconOnly?: boolean;
  portal?: boolean;
  triggerId?: string;
  labelledBy?: string;
  required?: boolean;
  triggerClassName?: string;
}

export function Dropdown({ value, options, onChange, variant = "filter", align: alignOverride, prefix, label, disabled = false, className, overlay = false, menuMinWidth = 0, hideScrollbar = false, iconOnly = false, portal = false, triggerId, labelledBy, required, triggerClassName }: DropdownProps) {
  const policy = useContext(DropdownPolicy);
  const align = alignOverride ?? policy.align;
  const contentWidth = iconOnly || policy.contentWidth;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const normalized = normalizeOptions(options);
  const currentOption = normalized.find((option) => option.value === value);
  const currentLabel = currentOption?.label ?? value;
  const optionSignature = JSON.stringify(normalized.map(option => [option.value, option.label, !!option.icon]));
  // Icon pickers inside transformed/scrolling drawers need viewport coordinates.
  // Other overlays remain in their parent's focus boundary (e.g. profile dialogs).
  const portalOverlay = overlay && (iconOnly || portal);

  useLayoutEffect(() => {
    if (!open) return;
    // Fixed positioning escapes the profile's scroll area without moving the
    // listbox outside its DOM/focus boundary or expanding the parent panel.
    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8, gap = 4;
      // 설정 목록은 내용 너비와 오른쪽 기준을 사용하고, 다른 화면은 트리거 너비를 유지한다.
      const availableWidth = Math.max(1, window.innerWidth - margin * 2);
      menu.style.width = contentWidth ? "max-content" : `${rect.width}px`;
      menu.style.maxWidth = `${availableWidth}px`;
      const width = Math.min(contentWidth ? Math.max(iconOnly ? rect.width : 0, menuMinWidth, menu.getBoundingClientRect().width) : rect.width, availableWidth);
      const left = Math.max(margin, Math.min(align === "right" ? rect.right - width : rect.left, window.innerWidth - width - margin));
      menu.style.width = `${width}px`;
      if (!overlay) {
        const root = rootRef.current?.getBoundingClientRect();
        menu.style.left = `${left - (root?.left ?? rect.left)}px`;
        menu.style.right = "auto";
        return;
      }
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const borderHeight = menu.offsetHeight - menu.clientHeight;
      const height = Math.min(menu.scrollHeight + borderHeight, window.innerHeight - margin * 2);
      const downward = below >= height || below >= above;
      // Show the full language list, shifting over the profile panel when
      // neither side of the trigger has enough room. Only tiny viewports scroll.
      const preferredTop = downward ? rect.bottom + gap : rect.top - gap - height;
      const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin));
      Object.assign(menu.style, {
        width: `${width}px`,
        left: `${left}px`,
        top: `${top}px`,
        maxHeight: `${height}px`,
      });
    };
    positionMenu();
    let disposed = false;
    void document.fonts.ready.then(() => { if (!disposed) positionMenu(); });
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", positionMenu, true);
    return () => {
      disposed = true;
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, overlay, menuMinWidth, contentWidth, iconOnly, align, optionSignature, value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
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
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (portalOverlay && event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? []);
    if (!options.length) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    }
  };

  const menu = open && !disabled ? (
        <div ref={menuRef} id={menuId} role="listbox" aria-label={label} onKeyDown={handleMenuKeyDown} className={cn(portalOverlay ? "z-(--layer-modal)" : "z-(--layer-popover)", "w-max overflow-y-auto rounded-(--radius-app) border border-(--control-border) bg-(--surface-app) p-1 shadow-(--shadow-panel)", hideScrollbar && styles.hideScrollbar, overlay ? "fixed" : "absolute top-full mt-1 max-h-60")}>
          {normalized.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={value === option.value} tabIndex={-1} disabled={disabled || option.disabled} onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[calc(var(--radius-app)-3px)] px-2.5 py-2 text-left text-xs outline-none hover:bg-(--control-hover) focus-visible:bg-(--control-hover) disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0" style={{ paddingBlock: "calc(0.5rem * var(--density-scale))" }}>
              <span className={cn("flex min-w-0 flex-1 items-center gap-2", value === option.value && "font-semibold text-(--color-primary-ink)")}>{option.icon ? <span aria-hidden="true" className="shrink-0">{option.icon}</span> : null}<Tooltip content={option.label} className="min-w-0 flex-1"><span className="min-w-0 flex-1 truncate">{option.label}</span></Tooltip></span>
              <Check size={14} aria-hidden="true" className={cn("shrink-0 text-(--color-primary-ink)", value !== option.value && "invisible")} />
            </button>
          ))}
        </div>
      ) : null;

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
      className={cn("relative", variant === "form" && "w-full", className)}
    >
      <button ref={triggerRef} id={triggerId} role={triggerId ? "combobox" : undefined} type="button" disabled={disabled} aria-label={label} aria-labelledby={labelledBy} aria-required={required} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((state) => !state)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }} className={cn("inline-flex min-h-11 items-center gap-1.5 outline-none transition hover:bg-(--control-hover) focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-45 md:[@media(pointer:fine)]:min-h-0", iconOnly ? "size-11 justify-center rounded-full bg-transparent md:[@media(pointer:fine)]:size-9" : cn("app-control justify-between border border-(--control-border) bg-(--control-bg)", triggerClassName ?? TRIGGER_STYLE[variant]))}>
        <span className="flex min-w-0 items-center gap-2">{currentOption?.icon ? <span aria-hidden="true" className="shrink-0">{currentOption.icon}</span> : null}<span className={iconOnly ? "sr-only" : "truncate"}>{prefix ? `${prefix}: ` : ""}{currentLabel}</span></span>
        {!iconOnly ? <ChevronDown size={14} className={cn("shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} /> : null}
      </button>
      {menu && portalOverlay ? createPortal(menu, document.body) : menu}
    </div>
  );
}
