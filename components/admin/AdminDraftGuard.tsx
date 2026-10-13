"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { adminDraftDestination } from "@/lib/admin-draft-navigation";
type Protection = { dirty: boolean; busy: boolean };
type Guard = { register: (id: string, protection: Protection | null) => void; requestAction: (action: () => void, needsConfirmation?: boolean) => void };
const Context = createContext<Guard | null>(null);
function closeAdminDrawer(drawer: Element | null) {
  if (drawer instanceof HTMLDialogElement && drawer.open) {
    drawer.querySelector<HTMLButtonElement>("[data-admin-drawer-close]")?.click();
    drawer.close();
  }
}
export function useAdminDraftGuard() {
  const guard = useContext(Context);
  if (!guard) throw new Error("AdminDraftGuard required");
  return guard;
}
export function useAdminDraftProtection(dirty: boolean, busy: boolean) {
  const { register } = useAdminDraftGuard(), id = useId();
  useEffect(() => { register(id, { dirty, busy }); return () => register(id, null); }, [register, id, dirty, busy]);
}
export function AdminDraftGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("settingsSystem.unsaved"), router = useRouter();
  const [forms, setForms] = useState<Record<string, Protection>>({});
  const dirty = Object.values(forms).some(form => form.dirty), busy = Object.values(forms).some(form => form.busy);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const location = useRef<{ href: string; state: unknown } | null>(null);
  const register = useCallback((id: string, protection: Protection | null) => {
    setForms(current => {
      if (!protection) { if (!(id in current)) return current; const next = { ...current }; delete next[id]; return next; }
      if (current[id]?.dirty === protection.dirty && current[id]?.busy === protection.busy) return current;
      return { ...current, [id]: protection };
    });
  }, []);
  const requestAction = useCallback((action: () => void, needsConfirmation = dirty) => {
    if (busy) return;
    if (needsConfirmation) setPending({ run: action }); else action();
  }, [dirty, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = adminDraftDestination(anchor.href, window.location.href);
      if (!destination) return;
      event.preventDefault(); event.stopPropagation();
      // Native mobile drawers are in the top layer; close them before the shared div-based modal.
      closeAdminDrawer(anchor.closest("#admin-mobile-navigation"));
      requestAction(() => router.push(destination));
    };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    document.addEventListener("click", intercept, true); window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", intercept, true); window.removeEventListener("beforeunload", unload); };
  }, [dirty, busy, requestAction, router]);
  useEffect(() => {
    if (!dirty && !busy) { location.current = null; return; }
    location.current = { href: window.location.href, state: window.history.state };
    const back = () => {
      const current = location.current; if (!current) return;
      const destination = adminDraftDestination(window.location.href, current.href); if (!destination) return;
      window.history.pushState(current.state, "", current.href);
      closeAdminDrawer(document.querySelector("#admin-mobile-navigation[open]"));
      requestAction(() => router.push(destination));
    };
    window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back);
  }, [dirty, busy, requestAction, router]);
  return <Context.Provider value={{ register, requestAction }}>{children}{pending && <ConfirmDialog tone="warning" title={t("title")} description={t("description")} confirmLabel={t("leave")} cancelLabel={t("stay")} confirmDisabled={busy} onCancel={() => setPending(null)} onConfirm={() => { if (busy) return; const action = pending.run; setPending(null); action(); }} />}</Context.Provider>;
}
