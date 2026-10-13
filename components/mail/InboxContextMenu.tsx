"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Files, Folder, Inbox, Mail, MailCheck, MoreHorizontal, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useMail } from "@/context/mail-context";
import { focusMenuItem } from "@/lib/menu-keyboard";
import type { FolderId } from "@/types/mail";
import { useEmptyTrash } from "./useEmptyTrash";

export function InboxContextMenu({ children, onOpen, folder = "inbox", mailboxId, mailboxName, onDelete, deleteLabel, deleteDisabled = false, managementActions = [], managementOnly = false, showTrigger = false, triggerIcon: TriggerIcon = MoreHorizontal, menuLabel, className = "" }: {
  children: ReactNode; onOpen: () => void; folder?: FolderId; mailboxId?: string; mailboxName?: string;
  onDelete?: () => void; deleteLabel?: string; deleteDisabled?: boolean;
  managementActions?: { label: string; icon: LucideIcon; disabled: boolean; run: () => void }[];
  managementOnly?: boolean; showTrigger?: boolean; triggerIcon?: LucideIcon; menuLabel?: string;
  className?: string;
}) {
  const t = useTranslations("inboxMenu");
  const router = useRouter();
  const emptyTrash = useEmptyTrash();
  const { activeFolder, activeCustomMailboxId, visibleEmails, setRead, refreshMailbox, refreshPending, pageTransitionPending, loadStatus, pendingMutationIds, uncertainMutationIds } = useMail();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = activeFolder === folder && (folder !== "custom" || activeCustomMailboxId === mailboxId);
  const unread = current ? visibleEmails.filter(email => email.unread) : [];
  const blocked = !current || pageTransitionPending || (loadStatus !== "ready") || !unread.length || unread.some(email => pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id));
  const show = (x: number, y: number) => setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - 248)), y: Math.max(8, Math.min(y, window.innerHeight - Math.min(window.innerHeight - 16, (managementOnly ? 0 : current ? 3 : 4) * 44 + managementActions.length * 44 + (onDelete ? 44 : 0) + (folder === "trash" && !managementOnly ? 44 : 0) + 10))) });
  const close = (restoreFocus = true) => { setPosition(null); if (restoreFocus) trigger.current?.focus(); };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setPosition(null); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) setPosition(null); };
    const resize = () => setPosition(null);
    document.addEventListener("pointerdown", outside); document.addEventListener("scroll", scroll, true); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", resize); };
  }, [position]);
  const actions = managementOnly ? [] : [
    ...(current ? [] : [{ label: t("open"), icon: folder === "all" ? Files : folder === "inbox" ? Inbox : Folder, disabled: false, run: onOpen }]),
    { label: t("refresh"), icon: RefreshCw, disabled: refreshPending, run: () => { if (current) refreshMailbox(); else onOpen(); } },
    { label: t("unread"), icon: Mail, disabled: folder === "custom" && !mailboxId, run: () => router.push({ pathname: "/search", query: folder === "custom" ? { q: "is:unread", mailboxId } : { q: folder === "all" ? "is:unread" : folder === "starred" ? "is:starred is:unread" : `in:${folder} is:unread` } }) },
    { label: t("readPage"), icon: MailCheck, disabled: blocked, run: () => { if (!blocked) for (const email of unread) setRead(email.id, true); } },
  ];
  actions.push(...managementActions);
  if (folder === "trash" && !managementOnly) actions.push({ label: emptyTrash.label, icon: Trash2, disabled: emptyTrash.disabled, run: emptyTrash.open });
  if (onDelete && deleteLabel) actions.push({ label: deleteLabel, icon: Trash2, disabled: deleteDisabled, run: onDelete });
  const label = menuLabel ?? (folder === "custom" ? mailboxName : t(folder === "all" ? "allLabel" : "label"));
  const standaloneTrigger = managementOnly && children == null;
  return <div ref={root} className={`workspace-menu-surface min-w-0 ${standaloneTrigger ? "w-fit" : "w-full"} transition ${showTrigger ? "flex items-center" : ""} ${className}`}
    onContextMenu={event => { event.preventDefault(); show(event.clientX, event.clientY); }}
    onKeyDown={event => { if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); show(rect.right, rect.bottom); } }}>
    {showTrigger && !standaloneTrigger ? <div className="min-w-0 flex-1">{children}</div> : children}
    {showTrigger ? <Tooltip content={label ?? t("label")} side="bottom" className="shrink-0"><button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!position}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) hover:bg-(--control-hover) focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:[@media(pointer:fine)]:size-8"
      onClick={event => { if (position) close(); else { const rect = event.currentTarget.getBoundingClientRect(); show(rect.right - 240, rect.bottom); } }}><TriggerIcon size={18} aria-hidden="true" /></button></Tooltip> : null}
    {position ? createPortal(<div ref={menu} role="menu" aria-label={label} style={{ left: position.x, top: position.y }}
      className="fixed z-(--layer-modal) max-h-[calc(100dvh-1rem)] w-60 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-(--border-app) bg-background p-1 shadow-xl"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } else if (event.key === "Tab") setPosition(null); else if (focusMenuItem(event.currentTarget, event.key)) event.preventDefault(); }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={event => { close(event.detail === 0); action.run(); }}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-(--control-hover) focus-visible:bg-(--control-hover) focus-visible:outline-none disabled:opacity-40">
        <action.icon size={16} className="shrink-0 text-(--text-muted)" />{action.label}
      </button>)}
    </div>, document.body) : null}
    {folder === "trash" ? emptyTrash.dialog : null}
  </div>;
}
