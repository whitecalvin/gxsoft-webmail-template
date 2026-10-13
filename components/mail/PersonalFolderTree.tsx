"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from "react";
import { useLocale } from "next-intl";
import { ChevronRight, Folder, FolderPlus, GripVertical, MailPlus, MoveRight, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context"; import { useMail } from "@/context/mail-context";
import { visiblePersonalFolderTree } from "@/lib/mailbox-visibility";
import { personalFolderTree, type PersonalFolderNode } from "@/lib/personal-folder-tree";
import { PersonalFolderIcon, kindKey } from "./PersonalFolderIcon";
import { folderDropChange, type FolderKinds } from "@/lib/personal-folder-drag";
import { useInitialMailboxIcons, useServerMailboxIcons } from "@/context/mailbox-icon-context";
import { useToast } from "@/context/toast-context";
import { PersonalFolderManager, type FolderManagerRequest } from "./PersonalFolderManager";
import { InboxContextMenu } from "./InboxContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";

function subscribeKinds(change: () => void) {
  window.addEventListener("storage", change); window.addEventListener("gxmail:folder-icon-changed", change);
  return () => { window.removeEventListener("storage", change); window.removeEventListener("gxmail:folder-icon-changed", change); };
}
type TreeDrag = {
  source: string | null; hover: string | null; disabled: boolean;
  begin: (id: string) => void; cancel: () => void; valid: (path: string) => boolean; move: (path: string) => Promise<void>;
  canDrop: (path: string) => boolean;
  start: (event: DragEvent, id: string) => void; over: (event: DragEvent, path: string) => void; drop: (event: DragEvent, path: string) => void;
  leave: (event: DragEvent) => void;
  pointerDown: (event: PointerEvent<HTMLButtonElement>, id: string) => void;
  pointerMove: (event: PointerEvent<HTMLButtonElement>) => void; pointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  pointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  clickHandle: (id: string) => void;
};

export function PersonalFolderTree({ compact, activeId, onOpen, activeClass, idleClass }: {
  compact: boolean; activeId: string | null; onOpen: (id: string) => void; activeClass: string; idleClass: string;
}) {
  const { mailboxes, accountAddress, changeFolder, folderChangePending, folderChangeUncertain } = useMail();
  const t = useTranslations("folderTree"); const folders = useTranslations("personalFolders"); const live = useTranslations("liveService"); const toast = useToast();
  const initial = useInitialMailboxIcons();
  const account = (accountAddress ?? "").trim().toLowerCase();
  const serverIcons = useServerMailboxIcons(account);
  const snapshot = (server: boolean) => JSON.stringify(mailboxes.map(m => {
    const key = kindKey(account, m.id);
    if (serverIcons.matched) return [m.id, serverIcons.preferences[key] === "folder" ? "folder" : "mailbox"];
    let value = initial[key];
    if (!server) { try { value = window.localStorage.getItem(key) ?? value; } catch { /* Keep the SSR choice. */ } }
    return [m.id, value === "folder" ? "folder" : "mailbox"];
  }));
  const kinds: FolderKinds = Object.fromEntries(JSON.parse(useSyncExternalStore(subscribeKinds, () => snapshot(false), () => snapshot(true))));
  const [selection, setSelection] = useState<{ id: string; account: string } | null>(null); const [hover, setHover] = useState<string | null>(null);
  const source = selection?.account === account ? selection.id : null;
  const picked = useRef<{ id: string; account: string } | null>(null); const moving = useRef(false);
  const touch = useRef<{ x: number; y: number; moved: boolean; path: string | null } | null>(null); const suppressClick = useRef(false);
  const disabled = !account || folderChangePending || folderChangeUncertain;
  const cancel = () => { picked.current = null; touch.current = null; setSelection(null); setHover(null); };
  useEffect(() => {
    if (!source) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      picked.current = null; touch.current = null; setSelection(null); setHover(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [source]);
  const begin = (id: string) => { if (disabled || moving.current) return; picked.current = { id, account }; setSelection({ id, account }); setHover(null); };
  const canDrop = (path: string) => !disabled && !!source && !!folderDropChange(mailboxes, kinds, source, path);
  const valid = (path: string) => !disabled && picked.current?.account === account && !!folderDropChange(mailboxes, kinds, picked.current.id, path);
  const move = async (path: string) => {
    const item = picked.current;
    if (!item || item.account !== account || disabled || moving.current) { cancel(); return; }
    const input = folderDropChange(mailboxes, kinds, item.id, path);
    cancel();
    if (!input) return;
    moving.current = true;
    try { await changeFolder(input); toast.success(t("moved")); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "mutation_uncertain";
      toast.error(reason === "mutation_uncertain" ? folders("uncertain") : reason === "conflict" || reason === "not_found" || reason === "notFound" ? folders("conflict")
        : reason === "invalid_request" ? folders("invalid") : ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? live(reason) : live("unavailable"));
    } finally { moving.current = false; }
  };
  const drag: TreeDrag = { source, hover, disabled, begin, cancel, valid, canDrop, move,
    start: (event, id) => { if (disabled || moving.current || touch.current) { event.preventDefault(); return; } begin(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-gxmail-folder", id); event.stopPropagation(); },
    over: (event, path) => { if (!picked.current) return; event.stopPropagation(); const allowed = valid(path); event.dataTransfer.dropEffect = allowed ? "move" : "none"; if (allowed) event.preventDefault(); setHover(allowed ? path : null); },
    leave: event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); },
    drop: (event, path) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.getData("application/x-gxmail-folder") !== picked.current?.id) { cancel(); return; } void move(path); },
    pointerDown: (event, id) => {
      if (disabled || moving.current || (event.button !== undefined && event.button !== 0)) return;
      // 손잡이는 마우스도 직접 처리합니다. 기본 HTML 드래그와 포인터 캡처가 경쟁하지 않게 합니다.
      if (event.pointerType === "mouse") event.preventDefault();
      begin(id); touch.current = { x: event.clientX, y: event.clientY, moved: false, path: null };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    pointerMove: event => {
      const current = touch.current; if (!current) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8 && !current.moved) return;
      current.moved = true; event.preventDefault();
      const target = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest("[data-folder-drop-path]");
      const path = target?.getAttribute("data-folder-drop-path") ?? null;
      current.path = path !== null && valid(path) ? path : null; setHover(current.path);
    },
    pointerUp: event => { const current = touch.current; touch.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (current) suppressClick.current = true; if (current?.moved) { if (current.path !== null) void move(current.path); else cancel(); } },
    pointerCancel: event => {
      // 포인터 손잡이 이동만 취소합니다. 별도 HTML 행 드래그에는 영향을 주지 않습니다.
      if (!touch.current) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      cancel();
    },
    clickHandle: id => { if (suppressClick.current) { suppressClick.current = false; return; } if (picked.current?.id === id) cancel(); else begin(id); },
  };
  const { saved } = useSettings();
  const nodes = visiblePersonalFolderTree(personalFolderTree(mailboxes), saved.inbox.hiddenMailboxIds);
  // 드래그 시작 시 기존 행이 포인터 아래에서 밀리지 않도록 루트 목적지는 목록 뒤에 둡니다.
  return <>{nodes.map(node => <FolderBranch key={node.path} node={node} kinds={kinds} drag={drag} compact={compact} activeId={activeId} onOpen={onOpen} activeClass={activeClass} idleClass={idleClass} />)}{source ? <li data-folder-drop-path="" onDragOver={e => drag.over(e, "")} onDragLeave={drag.leave} onDrop={e => drag.drop(e, "")} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } }}>
    <button type="button" disabled={!canDrop("")} onClick={() => { void move(""); }} className={`flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed px-3 text-xs text-(--text-muted) disabled:opacity-40 ${hover === "" ? "bg-(--color-primary)/10 border-(--color-primary)" : "border-(--border-app)"}`}><Folder size={16} />{t("moveRoot")}</button>
  </li> : null}</>;
}

function FolderBranch({ node, kinds, drag, compact, activeId, onOpen, activeClass, idleClass, depth = 0 }: {
  node: PersonalFolderNode; kinds: FolderKinds; drag: TreeDrag; compact: boolean; activeId: string | null; onOpen: (id: string) => void; activeClass: string; idleClass: string; depth?: number;
}) {
  const t = useTranslations("folderTree");
  const sidebar = useTranslations("workspaceSidebar");
  const folders = useTranslations("personalFolders"); const { saved } = useSettings();
  const locale = useLocale();
  const { folderChangePending, folderChangeUncertain } = useMail();
  const [request, setRequest] = useState<FolderManagerRequest | null>(null);
  const childrenId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const mailbox = node.mailbox;
  const kind = mailbox && kinds[mailbox.id] === "mailbox" ? "mailbox" : "folder";
  const kindLabel = useTranslations("mailboxKinds")(kind);
  // 사용자 지정 아이콘과 무관하게 종류 라벨은 항상 유지합니다.
  const kindBadge = <span data-mailbox-kind-label={kind} className={`shrink-0 rounded-md border px-1.5 text-[11px] font-medium leading-5 ${kind === "folder" ? "border-(--color-primary)/20 bg-(--color-primary)/10 text-(--color-primary-ink)" : "border-(--border-app) bg-(--surface-app) text-(--text-muted)"}`}>{kindLabel}</span>;
  const countLabel = mailbox ? sidebar("allMailCounts", { total: mailbox.totalEmails, unread: mailbox.unreadEmails }) : "";
  const storageLabel = mailbox?.usedBytes !== null && mailbox?.usedBytes !== undefined && mailbox.quotaBytes !== null && mailbox.quotaBytes > 0
    ? sidebar("storageUsage", { used: new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(mailbox.usedBytes / 1024 ** 2), limit: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mailbox.quotaBytes / 1024 ** 3) }) : null;
  const active = !!mailbox && activeId === mailbox.id;
  const expanded = compact || !collapsed;
  const row = <div data-mailbox-row data-mailbox-kind={kind} data-folder-drop-path={node.path} draggable={!!mailbox && !drag.disabled} onDragStart={e => { if (mailbox) drag.start(e, mailbox.id); }} onDragEnd={drag.cancel}
    onDragOver={e => drag.over(e, node.path)} onDrop={e => { if (drag.valid(node.path)) setCollapsed(false); drag.drop(e, node.path); }} onDragLeave={drag.leave}
    onKeyDown={e => { if (e.key === "Escape" && drag.source) { e.preventDefault(); e.stopPropagation(); drag.cancel(); } }}
    className={`workspace-menu-surface flex min-w-0 items-center ${drag.source === mailbox?.id ? "opacity-50" : ""} ${drag.hover === node.path ? "bg-(--color-primary)/10 ring-1 ring-(--color-primary)" : ""} ${compact ? "justify-center" : "gap-1 pl-2 pr-3"}`}>
      {mailbox && !compact ? <Tooltip content={t("drag", { name: node.label })} side="bottom" className="shrink-0"><button type="button" draggable={false} disabled={drag.disabled} aria-label={t("drag", { name: node.label })} aria-pressed={drag.source === mailbox.id}
        className="flex h-11 w-4 shrink-0 touch-none items-center justify-center rounded text-(--text-muted) cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:[@media(pointer:fine)]:h-8"
        onDragStart={e => drag.start(e, mailbox.id)} onDragEnd={drag.cancel} onPointerDown={e => drag.pointerDown(e, mailbox.id)} onPointerMove={drag.pointerMove} onPointerUp={drag.pointerUp} onPointerCancel={drag.pointerCancel} onClick={() => drag.clickHandle(mailbox.id)}><GripVertical size={14} /></button></Tooltip> : null}
      {!compact ? mailbox ? <PersonalFolderIcon mailboxId={mailbox.id} editable /> : <Folder size={19} className="mx-2 shrink-0" /> : null}
      {mailbox ? <Tooltip content={`${node.path} · ${kindLabel} · ${countLabel}`} side="bottom" className="min-w-0 flex-1"><button type="button" draggable={!drag.disabled} onDragStart={e => drag.start(e, mailbox.id)} onDragEnd={drag.cancel} onClick={() => { if (!drag.source) onOpen(mailbox.id); }} aria-current={active ? "page" : undefined}
        aria-label={compact ? `${node.path} · ${kindLabel} · ${countLabel}` : undefined} className={`flex min-w-0 flex-1 items-center gap-2 py-2 text-sm focus-visible:ring-2 focus-visible:ring-(--focus-ring) ${compact ? "justify-center" : "pr-1"}`}>
        {compact ? <PersonalFolderIcon mailboxId={mailbox.id} /> : <span className="min-w-0 flex-1 text-left"><span className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate font-medium">{node.label}</span>{kindBadge}</span>{saved.inbox.showMailboxCounts ? <span className="block truncate text-[10px] font-normal text-(--text-muted)">{countLabel}</span> : null}{saved.inbox.showMailboxStorage && storageLabel ? <span className="block truncate text-[10px] font-normal text-(--text-muted)">{storageLabel}</span> : null}</span>}
        {mailbox.unreadEmails > 0 ? <span className={compact ? "sr-only" : "min-w-6 shrink-0 rounded-full bg-(--color-primary-solid) px-1.5 py-0.5 text-center text-xs text-white"}>{mailbox.unreadEmails}</span> : null}
      </button></Tooltip> : !compact ? <Tooltip content={`${node.path} · ${kindLabel}`} side="bottom" className="min-w-0 flex-1"><span className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-sm font-medium"><span className="min-w-0 truncate">{node.label}</span>{kindBadge}</span></Tooltip> : null}
      {drag.source && drag.canDrop(node.path) ? <Tooltip content={t("drop", { name: node.label })} side="bottom" className="shrink-0"><button type="button" aria-label={t("drop", { name: node.label })} onClick={() => { void drag.move(node.path); }} className="flex size-8 shrink-0 items-center justify-center rounded text-(--color-primary-ink) hover:bg-(--color-primary)/10"><MoveRight size={16} /></button></Tooltip> : null}
      {!compact && node.children.length ? <button type="button" className="flex min-h-11 w-6 shrink-0 items-center justify-center rounded-full hover:bg-(--control-hover) focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:[@media(pointer:fine)]:min-h-6"
        aria-label={t(expanded ? "collapse" : "expand", { name: node.label })} aria-expanded={expanded} aria-controls={childrenId} onClick={() => setCollapsed(value => !value)}>
        <ChevronRight size={14} className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} />
      </button> : null}
    </div>;
  return <li className="min-w-0">
    <InboxContextMenu folder="custom" mailboxId={mailbox?.id} mailboxName={node.path} onOpen={() => { if (mailbox) onOpen(mailbox.id); }}
      className={active ? activeClass : idleClass}
      managementOnly={!mailbox} showTrigger={!compact} menuLabel={`${folders("manage")}: ${node.path}`}
      managementActions={[
        ...(mailbox ? [{ label: folders("move"), icon: MoveRight, disabled: drag.disabled, run: () => drag.begin(mailbox.id) }] : []),
        { label: folders("newFolder"), icon: FolderPlus, disabled: folderChangePending || folderChangeUncertain, run: () => setRequest({ kind: "folder", parentPath: node.path }) },
        { label: folders("newMailbox"), icon: MailPlus, disabled: folderChangePending || folderChangeUncertain, run: () => setRequest({ kind: "mailbox", parentPath: node.path }) },
        ...(mailbox ? [{ label: folders("rename"), icon: Pencil, disabled: folderChangePending || folderChangeUncertain || node.children.length > 0, run: () => setRequest({ kind: "rename", mailboxId: mailbox.id }) }] : []),
      ]}
      onDelete={mailbox ? () => setRequest({ kind: "delete", mailboxId: mailbox.id }) : undefined} deleteLabel={folders("delete")}
      deleteDisabled={folderChangePending || folderChangeUncertain || !mailbox || mailbox.totalEmails > 0 || node.children.length > 0}>
      {row}
    </InboxContextMenu>
    {request ? <PersonalFolderManager compact={compact} request={request} onClose={() => setRequest(null)} /> : null}
    {node.children.length && expanded ? <ul id={childrenId} className={compact ? "min-w-0 space-y-0.5" : depth < 3 ? "ml-3 min-w-0 space-y-0.5 border-l border-(--border-app) pl-1" : "min-w-0 space-y-0.5"}>
      {node.children.map(child => <FolderBranch key={child.path} node={child} kinds={kinds} drag={drag} depth={depth + 1} compact={compact} activeId={activeId} onOpen={onOpen} activeClass={activeClass} idleClass={idleClass} />)}
    </ul> : null}
  </li>;
}
