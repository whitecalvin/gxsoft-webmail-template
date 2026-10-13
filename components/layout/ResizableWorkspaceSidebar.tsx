"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLayoutWidths } from "@/context/layout-width-context";
import { layoutWidthCookieName, readLayoutWidthCookie, persistLayoutWidthCookie } from "@/lib/layout-width-cookie";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useTheme } from "@/context/theme-context";
import { draggedSidebarWidth, sidebarWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-width";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

const EVENT = "gxmail:sidebar-width";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}

export function ResizableWorkspaceSidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const t = useTranslations("sidebarResize");
  const { accountAddress } = useMail();
  const { draft } = useTheme();
  const right = draft.sidebarPosition === "right";
  const initial = useLayoutWidths();
  const account = (accountAddress ?? initial.account).trim().toLowerCase();
  const key = `gxmail:sidebar-width:v1:${encodeURIComponent(account)}`;
  const cookieName = layoutWidthCookieName("sidebar", account);
  const initialWidth = account === initial.account ? initial.sidebar : SIDEBAR_DEFAULT_WIDTH;
  const stored = useSyncExternalStore(subscribe, () => {
    try { return sidebarWidth(readLayoutWidthCookie(document.cookie, cookieName) ?? window.localStorage.getItem(key) ?? initialWidth); }
    catch { return initialWidth; }
  }, () => initialWidth);
  useEffect(() => {
    try {
      if (readLayoutWidthCookie(document.cookie, cookieName) === null) {
        persistLayoutWidthCookie(cookieName, sidebarWidth(window.localStorage.getItem(key) ?? initialWidth));
        window.dispatchEvent(new Event(EVENT));
      }
    } catch { /* Preserve the SSR width if browser persistence is unavailable. */ }
  }, [cookieName, key, initialWidth]);
  const [local, setLocal] = useState<{ key: string; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ key: string; x: number; width: number; right: boolean } | null>(null);
  useEffect(() => {
    const reset = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.reset === true && event.detail.account === account) {
        drag.current = null; setResizing(false); setLocal({ key, width: SIDEBAR_DEFAULT_WIDTH });
      }
    };
    window.addEventListener(EVENT, reset);
    return () => window.removeEventListener(EVENT, reset);
  }, [account, key]);
  const width = local?.key === key ? local.width : stored;
  const persist = (value: number) => {
    const next = sidebarWidth(value);
    setLocal({ key, width: next });
    persistLayoutWidthCookie(cookieName, next);
    try { window.localStorage.setItem(key, String(next)); window.dispatchEvent(new Event(EVENT)); } catch { /* Keep this session's chosen width if storage is unavailable. */ }
  };
  return <div className={`relative hidden h-full shrink-0 border-(--border-app) xl:block ${right ? "border-l" : "border-r"}`}>
    <WorkspaceSidebar collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} width={width} resizing={resizing} />
    {!collapsed ? <div role="separator" aria-orientation="vertical" aria-label={t("label")} aria-valuemin={SIDEBAR_MIN_WIDTH} aria-valuemax={SIDEBAR_MAX_WIDTH} aria-valuenow={width}
      data-resizing={resizing || undefined}
      tabIndex={0} title={t("hint")} className={`workspace-resize-handle absolute bottom-0 top-14 z-(--layer-sidebar-toggle) w-2 cursor-col-resize touch-none ${right ? "-left-1" : "-right-1"}`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { key, x: event.clientX, width, right };
        setResizing(true);
        setLocal({ key, width });
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start && start.key === key) setLocal({ key, width: draggedSidebarWidth(start.width, event.clientX - start.x, start.right) });
      }}
      onPointerUp={event => {
        const start = drag.current; drag.current = null;
        setResizing(false);
        if (start?.key === key) persist(draggedSidebarWidth(start.width, event.clientX - start.x, start.right));
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { const start = drag.current; drag.current = null; setResizing(false); if (start?.key === key) setLocal({ key, width: start.width }); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onDoubleClick={() => persist(SIDEBAR_DEFAULT_WIDTH)}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); persist(draggedSidebarWidth(width, event.key === "ArrowRight" ? 10 : -10, right));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault(); persist(event.key === "Home" ? SIDEBAR_MIN_WIDTH : SIDEBAR_MAX_WIDTH);
        }
      }} /> : null}
  </div>;
}
