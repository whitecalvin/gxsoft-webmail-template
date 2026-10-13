"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useLayoutWidths } from "@/context/layout-width-context";
import { layoutWidthCookieName, readLayoutWidthCookie, persistLayoutWidthCookie } from "@/lib/layout-width-cookie";
import { mailListWidth, MAIL_LIST_DEFAULT_WIDTH, MAIL_LIST_MIN_WIDTH } from "@/lib/mail-list-width";

const EVENT = "gxmail:mail-list-width";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}

export function ResizableMailList({ children, visible }: { children: ReactNode; visible: boolean }) {
  const t = useTranslations("mailListResize");
  const { accountAddress } = useMail();
  const initial = useLayoutWidths();
  const account = (accountAddress ?? initial.account).trim().toLowerCase();
  const key = `gxmail:mail-list-width:v1:${encodeURIComponent(account)}`;
  const cookieName = layoutWidthCookieName("mail-list", account);
  const initialWidth = account === initial.account ? initial.mailList : MAIL_LIST_DEFAULT_WIDTH;
  const stored = useSyncExternalStore(subscribe, () => {
    try { return mailListWidth(readLayoutWidthCookie(document.cookie, cookieName) ?? window.localStorage.getItem(key) ?? initialWidth); }
    catch { return initialWidth; }
  }, () => initialWidth);
  useEffect(() => {
    try {
      if (readLayoutWidthCookie(document.cookie, cookieName) === null) {
        persistLayoutWidthCookie(cookieName, mailListWidth(window.localStorage.getItem(key) ?? initialWidth));
        window.dispatchEvent(new Event(EVENT));
      }
    } catch { /* Preserve the SSR width if browser persistence is unavailable. */ }
  }, [cookieName, key, initialWidth]);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; x: number; width: number } | null>(null);
  const [available, setAvailable] = useState(Infinity);
  const [local, setLocal] = useState<{ key: string; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    const reset = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.reset === true && event.detail.account === account) {
        drag.current = null; setResizing(false); setLocal({ key, width: MAIL_LIST_DEFAULT_WIDTH });
      }
    };
    window.addEventListener(EVENT, reset);
    return () => window.removeEventListener(EVENT, reset);
  }, [account, key]);
  useEffect(() => {
    const container = root.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (typeof width === "number" && width > 0) setAvailable(width); });
    observer.observe(container); return () => observer.disconnect();
  }, []);
  const width = mailListWidth(local?.key === key ? local.width : stored, available);
  const max = mailListWidth(720, available);
  const persist = (value: number) => {
    const next = mailListWidth(value, available); setLocal({ key, width: next });
    persistLayoutWidthCookie(cookieName, next);
    try { window.localStorage.setItem(key, String(next)); window.dispatchEvent(new Event(EVENT)); } catch { /* Retain session width when storage is restricted. */ }
  };
  return <div ref={root} style={{ "--mail-list-width": `${width}px` } as CSSProperties}
    className={`workspace-mail-list relative h-full min-w-0 w-full shrink-0 ${visible ? "block" : "hidden"} lg:block`}>
    {children}
    <div role="separator" aria-orientation="vertical" tabIndex={0} aria-label={t("label")} title={t("hint")}
      aria-valuemin={MAIL_LIST_MIN_WIDTH} aria-valuemax={max} aria-valuenow={width}
      data-resizing={resizing || undefined}
      className="workspace-resize-handle absolute -right-1 inset-y-0 z-(--layer-sidebar-toggle) hidden w-2 cursor-col-resize touch-none lg:block"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { key, x: event.clientX, width };
        setResizing(true);
      }}
      onPointerMove={event => { const start = drag.current; if (start?.key === key) setLocal({ key, width: mailListWidth(start.width + event.clientX - start.x, available) }); }}
      onPointerUp={event => {
        const start = drag.current; drag.current = null;
        setResizing(false);
        if (start?.key === key) persist(start.width + event.clientX - start.x);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { const start = drag.current; drag.current = null; setResizing(false); if (start?.key === key) setLocal({ key, width: start.width }); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onDoubleClick={() => persist(MAIL_LIST_DEFAULT_WIDTH)}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); persist(width + (event.key === "ArrowRight" ? 10 : -10)); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); persist(event.key === "Home" ? MAIL_LIST_MIN_WIDTH : max); }
      }} />
  </div>;
}
