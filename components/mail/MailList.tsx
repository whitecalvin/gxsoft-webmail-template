"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CheckSquare, ChevronLeft, ClipboardList, FolderInput, MinusSquare, MoreHorizontal, RefreshCw, Square, Star, Trash2, X } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useTheme } from "@/context/theme-context";
import { useToast } from "@/context/toast-context";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { useMailTimestamp } from "./useMailTimestamp";
import { useContinueDraft } from "./useContinueDraft";
import { FOLDERS } from "@/lib/mail-folders";
import { focusMenuItem } from "@/lib/menu-keyboard";
import { selectMailRows } from "@/lib/mail-selection";
import { MailSelectionGestures } from "@/lib/mail-selection-gestures";
import { attachSelectionHistory } from "@/lib/mail-selection-history";
import { Dropdown } from "@/components/ui/Dropdown";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { ActionSheet, type ActionSheetItem } from "@/components/overlay/ActionSheet";
import { Tooltip } from "@/components/ui/Tooltip";
import { BottomSheet, BottomSheetRow } from "@/components/overlay/BottomSheet";
import { LiveMailRules } from "@/components/settings/LiveMailRules";
import { mailRuleFromSender } from "@/lib/mail-rule-from-message";
import type { Email, FolderId } from "@/types/mail";
import type { LayoutStyle } from "@/types/theme";

// The inbox list pane (left of ReadingPane in AppShell). Row layout and
// hover styles vary by the active layout preset (classic/card/minimal) from
// the theme customizer.
const FOLDER_DOT: Record<FolderId, string> = {
  all: "#3B7A94",
  inbox: "#2B4BF2",
  starred: "#B4740F",
  drafts: "#9A9EA5",
  sent: "#2E8B5B",
  archive: "#3B7A94",
  spam: "#B4740F",
  trash: "#C0433B",
  custom: "#3B7A94",
};

const CONTAINER_STYLE: Record<LayoutStyle, string> = {
  classic: "border-r border-(--border-app) bg-background",
  card: "bg-(--surface-muted)",
  minimal: "border-r border-(--border-app) bg-background",
};

const HEADER_STYLE: Record<LayoutStyle, string> = {
  classic: "border-b border-(--border-app)",
  card: "",
  minimal: "border-b border-(--border-app)",
};

const LIST_STYLE: Record<LayoutStyle, string> = {
  classic: "",
  card: "flex flex-col gap-2 p-3",
  minimal: "",
};

function itemClass(style: LayoutStyle, isActive: boolean) {
  if (style === "card") {
    return `rounded-(--radius-app) bg-background shadow-sm transition hover:shadow-md ${
      isActive ? "ring-2 ring-(--color-primary)" : ""
    }`;
  }
  if (style === "minimal") {
    return `border-b border-transparent transition ${
      isActive
        ? "border-l-2 border-l-(--color-primary) bg-black/2 dark:bg-white/3"
        : "border-l-2 border-l-transparent hover:bg-black/2 dark:hover:bg-white/3"
    }`;
  }
  return `border-b border-(--border-app) transition ${
    isActive
      ? "bg-(--color-primary)/10"
      : "hover:bg-black/3 dark:hover:bg-white/5"
  }`;
}

export function MailList() {
  const continueDraft = useContinueDraft();
  const router = useRouter();
  const t = useTranslations("mailList");
  const bulk = useTranslations("mailSelection");
  const tAuth = useTranslations("auth.common");
  const tFolder = useTranslations("sidebar");
  const tWorkspace = useTranslations("workspaceSidebar");
  const tService = useTranslations("liveService");
  const tMailbox = useTranslations("mailboxesLive");
  const tShortcut = useTranslations("shortcutReference.actions");
  const rules = useTranslations("rulesLive");
  const formatMailTimestamp = useMailTimestamp();
  const { visibleEmails, selectedEmailId, selectEmail, setRead, toggleStar, moveToTrash, moveToFolder, moveToCustomMailbox, activeCustomMailboxId, mailboxes, permanentlyDelete, activeFolder, activeCustomMailboxName, accountAddress, loadStatus, pagePosition, pageTransitionPending, pageTotal, pageLimit, setPagePosition, retryLoad, refreshMailbox, refreshAttempt, refreshPending, refreshReceipt, mutationStatus, pendingMutationIds, uncertainMutationIds } = useMail();
  const { draft } = useTheme();
  const toast = useToast();
  const manualRefresh = useRef<{ attempt: number; viewKey: string } | null>(null);
  const refreshViewKey = JSON.stringify([activeFolder, activeCustomMailboxId, pagePosition]);
  const selectionView = JSON.stringify([accountAddress, refreshViewKey]);
  const [selection, setSelection] = useState<{ view: string; ids: string[]; anchor: string | null }>({ view: "", ids: [], anchor: null });
  const [bulkDelete, setBulkDelete] = useState<{ view: string; ids: string[] } | null>(null);
  const visibleIds = visibleEmails.map(email => email.id);
  const checkedIds = selection.view === selectionView ? selection.ids.filter(id => visibleIds.includes(id)) : [];
  const selectedRows = visibleEmails.filter(email => checkedIds.includes(email.id));
  const selectionMode = checkedIds.length > 0;
  const [selectionGestures] = useState(() => new MailSelectionGestures());
  const bulkBlocked = pageTransitionPending || (loadStatus !== "ready") || checkedIds.some(id => pendingMutationIds.includes(id) || uncertainMutationIds.includes(id));
  // Page/account changes discard selection and destructive confirmations.
  if (selection.view !== selectionView) {
    setSelection({ view: selectionView, ids: [], anchor: null });
    if (bulkDelete) setBulkDelete(null);
  }
  const clearChecked = () => setSelection({ view: selectionView, ids: [], anchor: null });
  const checkRow = (id: string, range: boolean) => setSelection(current => {
    const sameView = current.view === selectionView;
    return { view: selectionView, ids: selectMailRows(sameView ? current.ids : [], id, sameView ? current.anchor : null, range, visibleIds), anchor: range && sameView && current.anchor ? current.anchor : id };
  });
  useEffect(() => {
    selectionGestures.cancel();
    if (!selectionMode) return;
    const dismiss = () => {
      setSelection({ view: selectionView, ids: [], anchor: null });
      setBulkDelete(null);
    };
    const releaseHistory = attachSelectionHistory(window, dismiss);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("keydown", onEscape); releaseHistory(); };
  }, [selectionMode, selectionView, selectionGestures]);
  useEffect(() => () => selectionGestures.cancel(), [selectionGestures, selectionView]);
  const runBulk = (action: "read" | "unread" | "star" | "unstar" | "delete" | "move", destination?: FolderId | { mailboxId: string }) => {
    if (bulkBlocked || !selectedRows.length) return;
    if (action === "delete" && activeFolder === "trash") { setBulkDelete({ view: selectionView, ids: [...checkedIds] }); return; }
    // Keep per-message confirmation, quota projection and uncertainty guards.
    // A dispatched batch is not a confirmed success.
    for (const email of selectedRows) {
      if (action === "read" || action === "unread") setRead(email.id, action === "read");
      else if (action === "star" || action === "unstar") { if (email.starred !== (action === "star")) toggleStar(email.id); }
      else if (action === "delete") moveToTrash(email.id);
      else if (destination && typeof destination === "object") moveToCustomMailbox(email.id, destination.mailboxId);
      else if (destination) moveToFolder(email.id, destination);
    }
    clearChecked();
  };
  useEffect(() => {
    const request = manualRefresh.current;
    if (!request) return;
    // Only a confirmed response for this click and view may announce completion.
    if (request.viewKey !== refreshViewKey) { manualRefresh.current = null; return; }
    if (refreshReceipt.attempt < request.attempt || refreshReceipt.viewKey !== request.viewKey) return;
    manualRefresh.current = null;
    if (refreshReceipt.status === "ready") toast.success(t("refreshComplete"));
    else toast.error(tService(refreshReceipt.status));
  }, [refreshReceipt, refreshViewKey, toast, t, tService]);
  const [pendingPermDelete, setPendingPermDelete] = useState<Email | null>(null);
  const [actionSheetEmail, setActionSheetEmail] = useState<Email | null>(null);
  const [ruleSender, setRuleSender] = useState<{ account: string; sender: string } | null>(null);
  if (ruleSender && ruleSender.account !== accountAddress) setRuleSender(null);
  const [moveSheetEmail, setMoveSheetEmail] = useState<Email | null>(null);
  const [desktopMenu, setDesktopMenu] = useState<{ id: string; x: number; y: number; move: boolean } | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuTriggerRef = useRef<HTMLElement | null>(null);
  const style = draft.layoutStyle;
  const desktopMenuEmail = desktopMenu ? visibleEmails.find((email) => email.id === desktopMenu.id) : null;
  const hasUncertainVisibleMutation = visibleEmails.some((email) => uncertainMutationIds.includes(email.id));

  useEffect(() => {
    if (!desktopMenu) return;
    desktopMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        setDesktopMenu(null);
        const trigger = desktopMenuTriggerRef.current;
        if (trigger?.isConnected) trigger.focus();
      }
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!desktopMenuRef.current?.contains(event.target as Node)) setDesktopMenu(null);
    };
    const closeOnScroll = (event: Event) => {
      // Scrolling a long folder menu (including keyboard focus scrolling)
      // must not dismiss it. Only close when the surrounding page moves.
      if (event.target instanceof Node && desktopMenuRef.current?.contains(event.target)) return;
      setDesktopMenu(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [desktopMenu]);

  const folderLabel = activeFolder === "custom"
    ? activeCustomMailboxName ?? tWorkspace("mailboxGroup")
    : tFolder(activeFolder);

  // Trashing an already-trashed email means permanent delete (with a
  // confirm dialog); trashing anything else is reversible via an undo toast.
  const handleTrashClick = (email: Email) => {
    if (email.folder === "trash") {
      setPendingPermDelete(email);
      return;
    }
    { moveToTrash(email.id); return; }

  };

  const actionItems = (email: Email): ActionSheetItem[] => [
    ...(continueDraft.canResume(email) ? [{ label: t("continueDraft"), onClick: () => { void continueDraft.resume(email); } }] : []),
    { label: t(email.unread ? "markRead" : "markUnread"), onClick: () => setRead(email.id, email.unread) },
    { label: email.starred ? tMailbox("unstar") : t("markImportant"), onClick: () => toggleStar(email.id) },
    { label: rules("createFromMessage"), onClick: () => {
      if (!accountAddress || !mailRuleFromSender(email.from.email, rules("newName"))) { toast.error(rules("checkInvalid")); return; }
      setRuleSender({ account: accountAddress, sender: email.from.email });
    } },
    ...(email.folder === "trash" ? [
      { label: t("restoreToInbox"), onClick: () => {
        moveToFolder(email.id, "inbox");

      } },
      { label: t("permanentDelete"), destructive: true, onClick: () => setPendingPermDelete(email) },
    ] : [
      { label: t("moveToFolder"), onClick: () => {
        if (desktopMenu) setDesktopMenu({ ...desktopMenu, move: true });
        else setMoveSheetEmail(email);
      } },
      { label: t("delete"), destructive: true, onClick: () => handleTrashClick(email) },
    ]),
  ];

  const openDesktopMenu = (email: Email, x: number, y: number, trigger?: HTMLElement) => {
    desktopMenuTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const width = 220;
    const height = 248;
    setDesktopMenu({
      id: email.id,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      move: false,
    });
  };

  const moveDestinations = (email: Email) => [
    ...FOLDERS.filter((folder) => folder.id !== "all" && folder.id !== email.folder && (["inbox", "archive", "spam", "trash"].includes(folder.id)))
      .map((folder) => ({ key: folder.id, label: tFolder(folder.id), dot: FOLDER_DOT[folder.id], onClick: () => {
        moveToFolder(email.id, folder.id);

      } })),
    ...(mailboxes.filter((mailbox) => mailbox.role === null && mailbox.id !== activeCustomMailboxId)
      .map((mailbox) => ({ key: mailbox.id, label: mailbox.name, dot: FOLDER_DOT.custom, onClick: () => moveToCustomMailbox(email.id, mailbox.id) }))),
  ];

  return (
    <section
      aria-labelledby="mail-list-heading"
      className={`flex h-full w-full flex-col ${CONTAINER_STYLE[style]}`}
    >
      <header
        className={`flex h-14 shrink-0 items-center gap-1 px-3 py-0 text-sm font-semibold ${HEADER_STYLE[style]}`}
        style={{ paddingBlock: `calc(0.75rem * var(--density-scale))` }}
      >
        {selectionMode ? <button type="button" role="checkbox" aria-checked={checkedIds.length > 0 && checkedIds.length < visibleIds.length ? "mixed" : visibleIds.length > 0 && checkedIds.length === visibleIds.length} aria-label={bulk("selectPage")}
          disabled={!visibleIds.length || pageTransitionPending || (loadStatus !== "ready")}
          className="flex h-10 w-6 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) transition-colors hover:text-(--color-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:opacity-40 lg:h-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8"
          onClick={() => checkedIds.length === visibleIds.length ? clearChecked() : setSelection({ view: selectionView, ids: visibleIds, anchor: visibleIds[0] ?? null })}>
          {checkedIds.length > 0 ? checkedIds.length === visibleIds.length ? <CheckSquare size={16} className="text-(--color-primary-ink)" aria-hidden="true" /> : <MinusSquare size={16} className="text-(--color-primary-ink)" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
        </button> : null}
        <h2 id="mail-list-heading" className={`${selectionMode ? "sr-only sm:not-sr-only" : "inline"} shrink-0 text-sm font-semibold xl:sr-only`}>{folderLabel}</h2>
        {selectionMode ? <span aria-live="polite" className="min-w-0 truncate text-xs font-normal text-(--text-muted)">{bulk("selected", { count: checkedIds.length })}</span> : (loadStatus === "ready") && (
          <span className="font-normal text-(--text-muted)">
            {t("countUnit", { count: pageTotal })}
          </span>
        )}
        {!selectionMode ? (
            <Tooltip content={refreshPending ? t("liveLoading") : tShortcut("refresh")} side="bottom" className="ml-auto shrink-0">
          <button
            type="button"
              onClick={() => {
                manualRefresh.current = { attempt: refreshAttempt + 1, viewKey: refreshViewKey };
                refreshMailbox();
              }}
              disabled={refreshPending || pageTransitionPending || loadStatus === "loading" || loadStatus === "unauthorized" || loadStatus === "forbidden"}
              aria-busy={refreshPending}
            aria-label={tShortcut("refresh")}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-(--text-muted) transition hover:bg-black/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--color-primary) disabled:opacity-40 dark:hover:bg-white/10"
          >
              <RefreshCw size={16} aria-hidden="true" className={refreshPending ? "animate-spin motion-reduce:animate-none" : undefined} />
          </button>
          </Tooltip>
        ) : null}
      {selectionMode ? <div role="toolbar" aria-label={bulk("actions")} className="ml-auto flex shrink-0 items-center gap-0">
        <Tooltip content={bulk("actions")} side="bottom" className="shrink-0">
        <Dropdown value="" label={bulk("actions")} disabled={bulkBlocked} iconOnly overlay menuMinWidth={180}
          options={[{ value: "", label: bulk("actions"), icon: <ClipboardList size={18} />, disabled: true }, { value: "read", label: t("markRead") }, { value: "unread", label: t("markUnread") }, { value: "star", label: t("markImportant") }, { value: "unstar", label: tMailbox("unstar") }]}
          onChange={value => { if (["read", "unread", "star", "unstar"].includes(value)) runBulk(value as "read" | "unread" | "star" | "unstar"); }} />
        </Tooltip>
        <Tooltip content={t("moveToFolder")} side="bottom" className="shrink-0">
        <Dropdown value="" label={t("moveToFolder")} disabled={bulkBlocked} iconOnly overlay align="right" menuMinWidth={200}
          options={[{ value: "", label: t("moveToFolder"), icon: <FolderInput size={18} />, disabled: true },
            ...FOLDERS.filter(folder => folder.id !== activeFolder && ["inbox", "archive", "spam", "trash"].includes(folder.id)).map(folder => ({ value: folder.id, label: tFolder(folder.id) })),
            ...mailboxes.filter(mailbox => mailbox.role === null && mailbox.id !== activeCustomMailboxId).map(mailbox => ({ value: `custom:${mailbox.id}`, label: mailbox.name }))]}
          onChange={value => runBulk("move", value.startsWith("custom:") ? { mailboxId: value.slice(7) } : value as FolderId)} />
        </Tooltip>
        <Tooltip content={activeFolder === "trash" ? t("permanentDelete") : t("delete")} side="bottom" className="shrink-0">
        <button type="button" disabled={bulkBlocked} aria-label={activeFolder === "trash" ? t("permanentDelete") : t("delete")} onClick={() => runBulk("delete")}
          className="flex size-11 items-center justify-center rounded-full text-(--status-danger) hover:bg-(--control-hover) focus-visible:outline-2 focus-visible:outline-(--focus-ring) disabled:opacity-40 md:[@media(pointer:fine)]:size-9"><Trash2 size={17} /></button>
        </Tooltip>
        <Tooltip content={bulk("clear")} side="bottom" className="shrink-0">
        <button type="button" aria-label={bulk("clear")} onClick={clearChecked} className="flex size-11 items-center justify-center rounded-full hover:bg-(--control-hover) focus-visible:outline-2 focus-visible:outline-(--focus-ring) md:[@media(pointer:fine)]:size-9"><X size={17} /></button>
        </Tooltip>
      </div> : null}
      </header>

      {(mutationStatus || hasUncertainVisibleMutation) ? (
        <SystemErrorNotice message={hasUncertainVisibleMutation ? tService("mutationUncertain") : tService(mutationStatus!)} className="border-b border-(--border-app) px-4 py-2 text-xs text-(--status-danger)" />
      ) : null}
      <ul inert={pageTransitionPending} aria-busy={pageTransitionPending} className={`flex-1 overflow-y-auto ${LIST_STYLE[style]}`}>
        {loadStatus !== "ready" ? (
          <li className={loadStatus === "loading" ? "p-6 text-center text-sm text-(--text-muted)" : ""}>
            {loadStatus === "loading" ? <p role="status">{t("liveLoading")}</p> : <SystemErrorNotice message={t(({
              unauthorized: "liveUnauthorized",
              forbidden: "liveForbidden",
              rateLimited: "liveRateLimited",
              retryable: "liveRetryable",
              conflict: "liveRetryable",
              unavailable: "liveUnavailable",
            } as const)[loadStatus])} actionLabel={loadStatus === "unauthorized" ? tAuth("signIn") : t("liveRetry")} onAction={loadStatus === "unauthorized" ? () => router.push("/login") : retryLoad} className="p-6 text-center text-sm text-(--text-muted)" />}
          </li>
        ) : null}
        {loadStatus === "ready" && visibleEmails.length === 0 && (
          <li className="p-6 text-center text-sm text-(--text-muted)">
            {t("noMail")}
          </li>
        )}
        {visibleEmails.map((email) => {
          const isActive = email.id === selectedEmailId;
          const subject = email.subject || t("noSubject");
          return (
            <li key={email.id}>
              <div
                className={`group relative flex w-full items-start gap-2 px-3 text-left sm:gap-3 ${itemClass(
                  style,
                  isActive || checkedIds.includes(email.id)
                )}`}
                style={{ paddingBlock: `calc(0.75rem * var(--density-scale))` }}
                onContextMenu={(event) => {
                  if (window.innerWidth < 1024) return;
                  event.preventDefault();
                  if (!pendingMutationIds.includes(email.id)) openDesktopMenu(email, event.clientX, event.clientY);
                }}
              >
                <div className="flex shrink-0 items-start gap-0">
                {selectionMode ? <button type="button" role="checkbox" aria-checked={checkedIds.includes(email.id)} aria-label={bulk("selectMail", { subject })}
                  disabled={pageTransitionPending || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
                  onClick={event => checkRow(email.id, event.shiftKey)}
                  onMouseDown={event => { if (event.shiftKey) event.preventDefault(); }}
                  onKeyDown={event => { if (event.key === " " && event.shiftKey) { event.preventDefault(); checkRow(email.id, true); } }}
                  className="flex h-10 w-6 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) transition-colors hover:text-(--color-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:opacity-40 lg:h-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8">
                  {checkedIds.includes(email.id) ? <CheckSquare size={16} className="text-(--color-primary-ink)" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
                </button> : null}
                <button
                  type="button"
                  disabled={pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)}
                  onClick={() => toggleStar(email.id)}
                  className="flex h-10 w-6 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) hover:text-(--color-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) lg:h-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8"
                  aria-label={`${t("markImportant")}: ${subject}`}
                  aria-pressed={email.starred}
                >
                  <Star
                    size={16}
                    fill={email.starred ? "var(--color-accent)" : "none"}
                    color={
                      email.starred ? "var(--color-accent)" : "currentColor"
                    }
                  />
                </button>
                </div>

                <button
                  type="button"
                  onClick={event => {
                    if (selectionGestures.consume(email.id)) { event.preventDefault(); return; }
                    if (selectionMode || event.shiftKey || event.ctrlKey || event.metaKey) { event.preventDefault(); checkRow(email.id, event.shiftKey); }
                    else if (event.detail === 0 || window.matchMedia("(pointer: coarse)").matches) selectEmail(email.id);
                    else if (event.detail === 1) selectionGestures.single(() => selectEmail(email.id));
                  }}
                  onDoubleClick={event => {
                    if (window.matchMedia("(pointer: coarse)").matches) return;
                    event.preventDefault();
                    if (!selectionMode) selectionGestures.double(() => checkRow(email.id, false));
                  }}
                  onPointerDown={event => {
                    if (event.pointerType !== "touch" || selectionMode || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)) return;
                    selectionGestures.press(email.id, event.clientX, event.clientY, () => checkRow(email.id, false));
                  }}
                  onPointerMove={event => { if (event.pointerType === "touch") selectionGestures.move(event.clientX, event.clientY); }}
                  onPointerUp={() => selectionGestures.cancel()}
                  onPointerCancel={() => selectionGestures.cancel()}
                  onContextMenu={event => { if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault(); }}
                  onKeyDown={event => { if (event.key === " " && event.shiftKey) { event.preventDefault(); checkRow(email.id, false); } }}
                  onMouseDown={event => { if (event.shiftKey) event.preventDefault(); }}
                  aria-label={`${email.from.name}: ${subject}`}
                  aria-current={isActive ? "true" : undefined}
                  className="min-w-0 flex-1 select-none rounded-sm pr-10 text-left outline-none focus-visible:bg-(--control-hover) lg:pr-0"
                >
                  <span className="block min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm leading-5 ${email.unread ? "font-semibold" : "font-medium"}`}>
                        {email.from.name}
                      </span>
                      {email.unread && (
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--color-primary)" />
                      )}
                      <time dateTime={email.receivedAt} className="shrink-0 text-xs tabular-nums text-(--text-muted)">
                        {formatMailTimestamp(email.receivedAt)}
                      </time>
                    </span>
                    <span className={`mt-0.5 block truncate text-sm leading-5 ${email.unread ? "font-semibold" : "text-foreground/85"}`}>
                      {subject}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-4 text-(--text-muted) lg:group-hover:pr-17 lg:group-focus-within:pr-17">
                      {email.preview}
                    </span>
                  </span>
                </button>

                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 bg-transparent lg:top-auto lg:bottom-2 lg:translate-y-0 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleTrashClick(email)}
                    disabled={(pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id))}
                    className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-(--text-muted) hover:bg-(--control-hover) hover:text-(--status-danger) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) lg:flex"
                    aria-label={`${email.folder === "trash" ? t("permanentDelete") : t("delete")}: ${subject}`}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      if (window.innerWidth >= 1024) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        openDesktopMenu(email, rect.right, rect.bottom, event.currentTarget);
                      } else setActionSheetEmail(email);
                    }}
                    disabled={(pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id))}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-(--text-muted) hover:bg-(--control-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) lg:size-8"
                    aria-label={`${t("more")}: ${subject}`}
                    aria-haspopup="menu"
                    aria-expanded={desktopMenu?.id === email.id || actionSheetEmail?.id === email.id}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {loadStatus === "ready" && pageTotal > pageLimit ? (
        <nav aria-label={folderLabel} className="flex shrink-0 items-center justify-between gap-2 border-t border-(--border-app) px-3 py-2 text-xs">
          <button type="button" disabled={pageTransitionPending || pagePosition === 0} onClick={() => setPagePosition(Math.max(0, pagePosition - pageLimit))} className="rounded-(--radius-app) px-2 py-1.5 text-(--color-primary) disabled:opacity-40">{t("livePrevious")}</button>
          <span aria-live="polite" className="text-(--text-muted)">{pageTransitionPending ? t("liveLoading") : `${Math.min(pagePosition + 1, pageTotal)}–${Math.min(pagePosition + pageLimit, pageTotal)} / ${pageTotal}`}</span>
          <button type="button" disabled={pageTransitionPending || pagePosition + pageLimit >= pageTotal} onClick={() => setPagePosition(pagePosition + pageLimit)} className="rounded-(--radius-app) px-2 py-1.5 text-(--color-primary) disabled:opacity-40">{t("liveNext")}</button>
        </nav>
      ) : null}

      {desktopMenu && desktopMenuEmail && createPortal(
        <div
          ref={desktopMenuRef}
          role="menu"
          aria-label={desktopMenuEmail.subject || t("noSubject")}
          onKeyDown={(event) => {
            if (focusMenuItem(event.currentTarget, event.key)) event.preventDefault();
            else if (event.key === "ArrowLeft" && desktopMenu.move) {
              event.preventDefault();
              setDesktopMenu({ ...desktopMenu, move: false });
            }
          }}
          className="fixed z-(--layer-modal) max-h-[min(70vh,480px)] w-55 overflow-y-auto rounded-(--radius-app) border border-(--border-app) bg-background p-1.5 text-foreground shadow-xl"
          style={{ left: desktopMenu.x, top: desktopMenu.y }}
        >
          {desktopMenu.move ? (
            <>
              <button type="button" role="menuitem" onClick={() => setDesktopMenu({ ...desktopMenu, move: false })} className="flex min-h-9 w-full items-center gap-2 rounded-(--radius-app) px-2 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">
                <ChevronLeft size={16} />{t("moveMailTitle")}
              </button>
              {moveDestinations(desktopMenuEmail).map((destination) => (
                <button key={destination.key} type="button" role="menuitem" onClick={() => { destination.onClick(); setDesktopMenu(null); }} className="flex min-h-9 w-full items-center gap-2 rounded-(--radius-app) px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10">
                  <span className="size-2 rounded-full" style={{ backgroundColor: destination.dot }} />{destination.label}
                </button>
              ))}
            </>
          ) : actionItems(desktopMenuEmail).map((item) => (
            <button key={item.label} type="button" role="menuitem" onClick={() => { item.onClick(); if (item.label !== t("moveToFolder")) setDesktopMenu(null); }} className="flex min-h-9 w-full items-center rounded-(--radius-app) px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10" style={{ color: item.destructive ? "var(--status-danger)" : undefined }}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {actionSheetEmail && (
        <ActionSheet
          context={actionSheetEmail.subject || t("noSubject")}
          onClose={() => setActionSheetEmail(null)}
          items={actionItems(actionSheetEmail)}
        />
      )}

      {ruleSender && ruleSender.account === accountAddress ? <LiveMailRules key={JSON.stringify(ruleSender)} embedded sender={ruleSender.sender} onClose={() => setRuleSender(null)} /> : null}
      {continueDraft.confirmation}

      {moveSheetEmail && (
        <BottomSheet title={t("moveMailTitle")} onClose={() => setMoveSheetEmail(null)}>
          {moveDestinations(moveSheetEmail).map((destination) => (
            <BottomSheetRow
              key={destination.key}
              label={destination.label}
              dot={destination.dot}
              onClick={() => {
                destination.onClick();
                setMoveSheetEmail(null);
              }}
            />
          ))}
        </BottomSheet>
      )}

      {bulkDelete && bulkDelete.view === selectionView ? <ConfirmDialog tone="destructive" title={t("confirmPermDeleteTitle")}
        description={bulk("confirmDelete", { count: bulkDelete.ids.length })} confirmLabel={t("permanentDelete")}
        confirmDisabled={bulkDelete.ids.some(id => pendingMutationIds.includes(id) || uncertainMutationIds.includes(id)) || pageTransitionPending}
        onCancel={() => setBulkDelete(null)} onConfirm={() => {
          if (bulkDelete.view !== selectionView || pageTransitionPending || (loadStatus !== "ready") || bulkDelete.ids.some(id => pendingMutationIds.includes(id) || uncertainMutationIds.includes(id))) return;
          for (const id of bulkDelete.ids) if (visibleEmails.some(email => email.id === id && email.folder === "trash")) permanentlyDelete(id);
          setBulkDelete(null); clearChecked();
        }} /> : null}
      {pendingPermDelete && (
        <ConfirmDialog
          tone="destructive"
          title={t("confirmPermDeleteTitle")}
          description={t("confirmPermDeleteDesc")}
          confirmLabel={t("permanentDelete")}
          onCancel={() => setPendingPermDelete(null)}
          onConfirm={() => {
            permanentlyDelete(pendingPermDelete.id);
            setPendingPermDelete(null);

          }}
        />
      )}
    </section>
  );
}
