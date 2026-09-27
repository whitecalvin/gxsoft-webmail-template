"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "./utils";

export function Popover({ trigger, children, label, align = "right", open: controlledOpen, onOpenChange, className }: { trigger: ReactElement<{ onClick?: () => void; "aria-expanded"?: boolean; "aria-controls"?: string }>; children: ReactNode; label: string; align?: "left" | "right"; open?: boolean; onOpenChange?: (open: boolean) => void; className?: string }) {
  const [localOpen, setLocalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback((next: boolean) => { if (controlledOpen === undefined) setLocalOpen(next); onOpenChange?.(next); }, [controlledOpen, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", keyboard); };
  }, [open, setOpen]);
  return (
    <div ref={rootRef} className="relative inline-flex">
      {isValidElement(trigger) ? cloneElement(trigger, { onClick: () => setOpen(!open), "aria-expanded": open, "aria-controls": open ? id : undefined }) : trigger}
      {open ? <div id={id} role="dialog" aria-label={label} className={cn("absolute top-full z-(--layer-popover) mt-2 min-w-56 rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) p-3 shadow-(--shadow-panel)", align === "right" ? "right-0" : "left-0", className)}>{children}</div> : null}
    </div>
  );
}
