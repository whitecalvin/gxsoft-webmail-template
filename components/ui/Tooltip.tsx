"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tooltipPosition } from "@/lib/tooltip-position.mjs";
import { cn } from "./utils";

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = () => { if (!open) { setPosition(null); setOpen(true); } };
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!anchor.current || !tooltip.current) return;
        const viewport = window.visualViewport;
        setPosition(tooltipPosition(anchor.current.getBoundingClientRect(), tooltip.current.getBoundingClientRect(), {
          left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
          width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
        }, side));
      });
    };
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const resize = new ResizeObserver(update);
    if (anchor.current) resize.observe(anchor.current);
    if (tooltip.current) resize.observe(tooltip.current);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.addEventListener("keydown", dismiss);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", dismiss);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, side]);
  // 기본 display 유틸리티가 호출자의 hidden과 충돌하지 않도록 합니다.
  const hiddenByDefault = className?.split(/\s+/).includes("hidden");
  return <span ref={anchor} className={cn(!hiddenByDefault && "inline-flex", className)} aria-describedby={open ? id : undefined}
    onMouseEnter={() => { hovered.current = true; show(); }}
    onMouseLeave={() => { hovered.current = false; if (!focused.current) setOpen(false); }}
    onFocus={() => { focused.current = true; show(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { focused.current = false; if (!hovered.current) setOpen(false); } }}
    onClick={() => setOpen(false)}>
    {children}
    {open ? createPortal(<span ref={tooltip} id={id} role="tooltip"
      className="pointer-events-none fixed z-(--layer-tooltip) w-max max-w-[min(20rem,calc(100vw-1rem))] whitespace-normal rounded-md bg-(--toast-bg) px-2 py-1 text-[11px] font-medium text-(--toast-text) shadow-md [overflow-wrap:anywhere]"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>{content}</span>, document.body) : null}
  </span>;
}
