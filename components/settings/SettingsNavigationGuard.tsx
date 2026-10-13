"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSettings } from "@/context/settings-context";
import { useTheme } from "@/context/theme-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";

export function SettingsNavigationGuard() {
  const t = useTranslations("settingsSystem.unsaved");
  const router = useRouter();
  const { isDirty: draftDirty, busy, uncertain, discard } = useSettings();
  const isDirty = draftDirty || busy || uncertain;
  const { isDirty: themeDirty, closeCustomizer } = useTheme();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const guardedLocation = useRef<{ href: string; state: unknown } | null>(null);

  useEffect(() => {
    if (!isDirty && !themeDirty) return;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [isDirty, themeDirty]);

  useEffect(() => {
    if (!isDirty && !themeDirty) {
      guardedLocation.current = null;
      return;
    }

    guardedLocation.current = {
      href: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      state: window.history.state,
    };
    const interceptHistoryNavigation = () => {
      const guarded = guardedLocation.current;
      if (!guarded) return;
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (destination === guarded.href) return;
      window.history.pushState(guarded.state, "", guarded.href);
      setPendingHref(destination);
    };
    window.addEventListener("popstate", interceptHistoryNavigation);
    return () => window.removeEventListener("popstate", interceptHistoryNavigation);
  }, [isDirty, themeDirty]);

  if (!pendingHref) return null;
  return <ConfirmDialog tone="warning" title={t("title")} description={t("description")} confirmDisabled={busy || uncertain} confirmLabel={t("leave")} cancelLabel={t("stay")} onCancel={() => setPendingHref(null)} onConfirm={() => { if (busy || uncertain) return; const href = pendingHref; discard(); closeCustomizer({ discard: true }); setPendingHref(null); router.push(href); }} />;
}
