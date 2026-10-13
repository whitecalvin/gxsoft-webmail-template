"use client";
import { useEffect } from "react";
import { useSettings } from "@/context/settings-context";
import { useMail } from "@/context/mail-context";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ShortcutSequence } from "@/lib/mail-shortcuts";

export function WorkspaceShortcuts() {
  const { saved, hydrated } = useSettings();
  const { openCompose, setActiveFolder, selectedEmail, moveToFolder, pendingMutationIds, uncertainMutationIds, pageTransitionPending } = useMail();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!hydrated || !saved.shortcuts.enabled) return;
    const sequence = new ShortcutSequence();
    const reset = () => sequence.reset();
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey ||
        target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="menu"],[role="listbox"]') ||
        document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="toolbar"][aria-label]') || pathname.startsWith("/settings") || pathname === "/shortcuts") { reset(); return; }
      const action = sequence.match(event.key, saved.shortcuts.bindings, Date.now());
      if (!action) return;
      if (action === "compose") { event.preventDefault(); openCompose(); }
      else if (action === "search") { event.preventDefault(); router.push("/search"); }
      else if (action === "inbox") { event.preventDefault(); setActiveFolder("inbox"); router.push("/"); }
      else if (!pageTransitionPending && selectedEmail?.detailLoaded !== false) {
        if (action === "archive" && selectedEmail && selectedEmail.folder !== "archive" && !pendingMutationIds.includes(selectedEmail.id) && !uncertainMutationIds.includes(selectedEmail.id)) { event.preventDefault(); moveToFolder(selectedEmail.id, "archive"); }
        else {
          const button = document.querySelector<HTMLButtonElement>(`[data-mail-shortcut="${action}"]`);
          if (button && !button.disabled && !button.closest("[inert]")) { event.preventDefault(); button.click(); }
        }
      }
    };
    window.addEventListener("keydown", handle); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", handle); window.removeEventListener("blur", reset); };
  }, [hydrated, saved.shortcuts, pathname, router, openCompose, setActiveFolder, selectedEmail, moveToFolder, pendingMutationIds, uncertainMutationIds, pageTransitionPending]);
  return null;
}
