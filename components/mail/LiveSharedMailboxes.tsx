"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { LiveHtmlMessageBody } from "./LiveHtmlMessageBody";
import { MailDeliveryDetails } from "./MailDeliveryDetails";
import { AccountIcon } from "./AccountIcon";
import { draftRequiresPlainTextConfirmation, forwardedMailContent } from "@/lib/mail-draft";
import { SharedComposeModal } from "@/components/compose/ComposeModal";
import { ScheduledSubmissions } from "@/components/mail/ScheduledSubmissions";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { useSettings } from "@/context/settings-context";
import { replyQuote } from "@/lib/sending-settings";
import { mailReplyDraft } from "@/lib/mail-reply";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Folder, Mail, Search, Users, Reply, ReplyAll, Forward } from "lucide-react";
import { useFullMailTimestamp, useMailTimestamp } from "./useMailTimestamp";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveSharedMailbox } from "@/lib/tastemail/shared-mailboxes";
import type { LiveMailPage } from "@/lib/tastemail/mail";
import { requireLiveSearchDetail as requireLiveMailDetail } from "@/lib/tastemail/search-page";
import { requireLiveMailPage } from "@/lib/tastemail/mail-page";
import type { ComposeDraft, Email } from "@/types/mail";
import { confirmMessageFlag, mergeLoadedMailDetail, retainLoadedDetails } from "@/lib/mail-view";
import { PendingAutoRead } from "@/lib/mail-auto-read";
import { mailboxLabel } from "@/lib/mailbox-label";
import { clientMailFailure, requireConfirmedMailMutation } from "@/lib/tastemail/client-session-status";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "conflict" | "invalid_request";
const ERROR_STATUSES = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "conflict", "invalid_request"]);
const MAILBOX_TIMEOUT_MS = 25_000;
const MESSAGE_TIMEOUT_MS = 45_000;

export function LiveSharedMailboxes({ initialItems }: { initialItems?: LiveSharedMailbox[] | null } = {}) {
  const t = useTranslations("mailboxesPage");
  const live = useTranslations("mailboxesLive");
  const mailList = useTranslations("mailList");
  const reading = useTranslations("readingPane");
  const compose = useTranslations("composeModal");
  const service = useTranslations("liveService");
  const sidebar = useTranslations("sidebar");
  const topBar = useTranslations("topBar");
  const nav = useTranslations("nav");
  const search = useTranslations("searchPage");
  const { saved: preferences } = useSettings();
  const locale = useLocale();
  const formatTimestamp = useMailTimestamp();
  const formatDetailTimestamp = useFullMailTimestamp();
  const [status, setStatus] = useState<LoadStatus>(initialItems ? "ready" : "loading");
  const [items, setItems] = useState<LiveSharedMailbox[]>(initialItems ?? []);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<LiveSharedMailbox | null>(null);
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState<LiveMailPage | null>(null);
  const [message, setMessage] = useState<Email | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("ready");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [pageStatus, setPageStatus] = useState<LoadStatus>("loading");
  const [pageAttempt, setPageAttempt] = useState(0);
  const [flagBusy, setFlagBusy] = useState(false);
  const [pendingAutoRead] = useState(() => new PendingAutoRead());
  const mutationInFlight = useRef(false);
  // Page reads begun before a write settles cannot reconcile that write.
  const sharedDataRevision = useRef(0);
  const preserveMessageOnRefresh = useRef<string | null>(null);
  const [flagError, setFlagError] = useState<LoadStatus | null>(null);
  const [flagUncertain, setFlagUncertain] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingPlainTextEdit, setConfirmingPlainTextEdit] = useState(false);
  const [composingAccountId, setComposingAccountId] = useState<string | null>(null);
  const [composeInitial, setComposeInitial] = useState<ComposeDraft | null>(null);

  useEffect(() => {
    if (initialItems && attempt === 0) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MAILBOX_TIMEOUT_MS)]);
    fetch("/api/mail/shared-mailboxes", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) {
          throw new Error("unavailable");
        }
        return payload.items as LiveSharedMailbox[];
      })
      .then((mailboxes) => {
        if (controller.signal.aborted) return;
        setItems(mailboxes);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setItems([]);
        setStatus(ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt, initialItems]);

  useEffect(() => {
    if (!selected) return;
    const startedAtRevision = sharedDataRevision.current;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MESSAGE_TIMEOUT_MS)]);
    const query = new URLSearchParams({ accountId: selected.id, position: String(position) });
    if (mailboxId) query.set("mailboxId", mailboxId);
    if (searchQuery) query.set("q", searchQuery);
    fetch(`/api/mail/shared-messages?${query}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 400 && payload && typeof payload === "object" && "status" in payload && payload.status === "invalid_request") throw new Error("invalid_request");
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveMailPage(payload, selected.id);
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== sharedDataRevision.current) {
          setPageAttempt((value) => value + 1);
          return;
        }
        if (position > 0 && result.messages.length === 0 && result.total <= position && result.limit > 0) {
          setPosition(Math.max(0, Math.ceil(result.total / result.limit) - 1) * result.limit);
          return;
        }
        const retainedMessageId = preserveMessageOnRefresh.current;
        preserveMessageOnRefresh.current = null;
        setPage(result);
        setMessage((current) => {
          const updated = retainedMessageId ? result.messages.find((item) => item.id === retainedMessageId) : null;
          return current && updated ? retainLoadedDetails([current], [updated])[0] : null;
        });
        setPageStatus("ready");
        if (retainedMessageId) setFlagBusy(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== sharedDataRevision.current) {
          setPageAttempt((value) => value + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        const failure = ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
        if (failure === "unauthorized" || failure === "forbidden") {
          preserveMessageOnRefresh.current = null;
          setFlagBusy(false);
          setItems([]);
          setSelected(null);
          setPage(null);
          setMessage(null);
          setComposingAccountId(null);
          setComposeInitial(null);
          setFlagError(null);
          setFlagUncertain(false);
          setConfirmingDelete(false);
          setConfirmingPlainTextEdit(false);
          setStatus(failure);
          setPageStatus(failure);
          return;
        }
        if (preserveMessageOnRefresh.current) {
          preserveMessageOnRefresh.current = null;
          setFlagBusy(false);
          setFlagError(failure);
          return;
        }
        setPageStatus(failure);
      });
    return () => controller.abort();
  }, [selected, mailboxId, position, pageAttempt, searchQuery]);

  const pendingDetailId = selected && message?.detailLoaded === false ? message.id : null;
  const pendingAccountId = pendingDetailId ? selected?.id : null;

  useEffect(() => {
    if (!pendingDetailId || !pendingAccountId) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MESSAGE_TIMEOUT_MS)]);
    const query = new URLSearchParams({ accountId: pendingAccountId });
    fetch(`/api/mail/shared-messages/${encodeURIComponent(pendingDetailId)}?${query}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveMailDetail(payload, pendingDetailId);
      })
      .then((detail) => {
        if (controller.signal.aborted) return;
        setMessage((current) => current?.id === pendingDetailId
          ? mergeLoadedMailDetail(current, detail) : current);
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure = ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
        if (failure === "unauthorized" || failure === "forbidden") {
          setItems([]);
          setSelected(null);
          setPage(null);
          setMessage(null);
          setComposingAccountId(null);
          setComposeInitial(null);
          setFlagError(null);
          setFlagUncertain(false);
          setConfirmingDelete(false);
          setConfirmingPlainTextEdit(false);
          setStatus(failure);
          setPageStatus(failure);
        }
        setDetailStatus(failure);
      });
    return () => controller.abort();
  }, [pendingDetailId, pendingAccountId, detailAttempt]);

  useEffect(() => {
    if (!selected || !selected.rights.mayWrite || !message) {
      pendingAutoRead.clear();
      return;
    }
    const pendingKey = `${selected.id}:${message.id}`;
    if (!message.unread) {
      pendingAutoRead.clear(pendingKey);
      return;
    }
    if (message.detailLoaded !== false && pageStatus === "ready" && !flagBusy && !flagUncertain) {
      pendingAutoRead.complete(pendingKey);
    }
  }, [selected, message, pageStatus, flagBusy, flagUncertain, pendingAutoRead]);

  function openMailbox(item: LiveSharedMailbox) {
    pendingAutoRead.clear();
    setSearchInput("");
    setSearchQuery("");
    setSelected(item);
    setMailboxId(null);
    setPosition(0);
    setPage(null);
    setMessage(null);
    setDetailStatus("ready");
    setPageStatus("loading");
    setFlagError(null);
  }

  function clearSharedAccess(failure: "unauthorized" | "forbidden") {
    pendingAutoRead.clear();
    setItems([]);
    setSelected(null);
    setPage(null);
    setMessage(null);
    setComposingAccountId(null);
    setComposeInitial(null);
    setFlagError(null);
    setFlagUncertain(false);
    setConfirmingDelete(false);
    setConfirmingPlainTextEdit(false);
    setStatus(failure);
    setPageStatus(failure);
  }

  async function toggleFlag(flag: "seen" | "starred", target: Email | null = message) {
    if (!selected?.rights.mayWrite || !target || flagBusy || mutationInFlight.current || flagUncertain || pageStatus !== "ready") return;
    mutationInFlight.current = true;
    setFlagBusy(true);
    setFlagError(null);
    let refreshing = false;
    try {
      const response = await fetch("/api/mail/shared-messages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: selected.id, messageId: target.id, flag,
          value: flag === "seen" ? target.unread : !target.starred }),
        signal: AbortSignal.timeout(MESSAGE_TIMEOUT_MS),
      });
      await requireConfirmedMailMutation(response, "updated");
      sharedDataRevision.current += 1;
      const messageId = target.id;
      const value = flag === "seen" ? target.unread : !target.starred;
      setMessage((current) => current ? confirmMessageFlag(current, messageId, flag, value) : null);
      setPage((current) => current ? { ...current, messages: current.messages.map((item) => confirmMessageFlag(item, messageId, flag, value)) } : null);
      preserveMessageOnRefresh.current = messageId;
      refreshing = true;
      setPageAttempt((value) => value + 1);
    } catch (error) {
      sharedDataRevision.current += 1;
      const reason = error instanceof Error ? error.message : "retryable";
      const status = ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
      if (status === "retryable" || status === "unavailable") {
        setFlagUncertain(true);
        setPageStatus("loading");
        setPageAttempt((value) => value + 1);
      } else if (status === "unauthorized" || status === "forbidden") {
        clearSharedAccess(status);
      } else if (status === "conflict") {
        setFlagError(status);
        preserveMessageOnRefresh.current = target.id;
        setPageAttempt((value) => value + 1);
      } else {
        setFlagError(status);
      }
    } finally {
      mutationInFlight.current = false;
      if (!refreshing) setFlagBusy(false);
    }
  }

  async function moveSelectedMessage(target: "inbox" | "trash" | { mailboxId: string }) {
    if (!selected?.rights.mayWrite || !message || !page?.mailboxId || mutationInFlight.current || flagUncertain || pageStatus !== "ready") return;
    mutationInFlight.current = true;
    setFlagBusy(true);
    setFlagError(null);
    try {
      const response = await fetch("/api/mail/shared-move", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: selected.id, messageId: message.id, sourceMailboxId: page.mailboxId,
          ...(typeof target === "string" ? { target } : { targetMailboxId: target.mailboxId }) }),
        signal: AbortSignal.timeout(MESSAGE_TIMEOUT_MS),
      });
      await requireConfirmedMailMutation(response, "updated");
      sharedDataRevision.current += 1;
      setMessage(null);
      setPageStatus("loading");
      setPageAttempt((value) => value + 1);
    } catch (error) {
      sharedDataRevision.current += 1;
      const reason = error instanceof Error ? error.message : "retryable";
      const status = ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
      if (status === "retryable" || status === "unavailable") {
        setFlagUncertain(true);
        setPageStatus("loading");
        setPageAttempt((value) => value + 1);
      } else if (status === "unauthorized" || status === "forbidden") {
        clearSharedAccess(status);
      } else if (status === "conflict") {
        setFlagError(status);
        preserveMessageOnRefresh.current = message.id;
        setPageAttempt((value) => value + 1);
      } else {
        setFlagError(status);
      }
    } finally {
      mutationInFlight.current = false;
      setFlagBusy(false);
    }
  }

  async function destroySelectedMessage() {
    if (!selected?.rights.mayWrite || !message || !page?.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role === "trash") ||
        mutationInFlight.current || flagUncertain || pageStatus !== "ready") return;
    mutationInFlight.current = true;
    setFlagBusy(true);
    setFlagError(null);
    try {
      const response = await fetch("/api/mail/shared-destroy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: selected.id, messageId: message.id }),
        signal: AbortSignal.timeout(MESSAGE_TIMEOUT_MS),
      });
      await requireConfirmedMailMutation(response, "destroyed");
      sharedDataRevision.current += 1;
      setMessage(null);
      setPageStatus("loading");
      setPageAttempt((value) => value + 1);
    } catch (error) {
      sharedDataRevision.current += 1;
      const reason = error instanceof Error ? error.message : "retryable";
      const status = ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable";
      if (status === "retryable" || status === "unavailable") {
        setFlagUncertain(true);
        setPageStatus("loading");
        setPageAttempt((value) => value + 1);
      } else if (status === "unauthorized" || status === "forbidden") {
        clearSharedAccess(status);
      } else if (status === "conflict") {
        setFlagError(status);
        preserveMessageOnRefresh.current = message.id;
        setPageAttempt((value) => value + 1);
      } else {
        setFlagError(status);
      }
    } finally {
      mutationInFlight.current = false;
      setFlagBusy(false);
    }
  }

  function forwardSelectedMessage() {
    if (!selected || !message || message.detailLoaded === false || pageStatus !== "ready" ||
        !selected.rights.mayRead || !selected.rights.mayWrite || !selected.rights.maySend ||
        flagBusy || flagUncertain || mutationInFlight.current || composingAccountId) return;
    setComposeInitial({
      fromAddress: selected.address,
      to: "",
      subject: message.subject.startsWith("FWD:") ? message.subject : `FWD: ${message.subject || mailList("noSubject")}`,
      ...forwardedMailContent(message, reading("originalMessageHeader")),
    });
    setComposingAccountId(selected.id);
  }

  function replySelectedMessage(all: boolean) {
    if (!selected || !message || message.detailLoaded === false || pageStatus !== "ready" ||
        !selected.rights.mayRead || !selected.rights.mayWrite || !selected.rights.maySend ||
        flagBusy || flagUncertain || mutationInFlight.current || composingAccountId) return;
    const quoted = replyQuote(`${reading("originalMessageHeader")}\n${message.from.name} <${message.from.email}>\n${message.bodyText ?? message.body.join("\n")}`, preferences.sending.quoteStyle);
    setComposeInitial(mailReplyDraft(message, selected.address, all, quoted));
    setComposingAccountId(selected.id);
  }

  function editSelectedDraft(asPlainText = false) {
    if (!selected || !message || !page?.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role === "drafts") ||
        !selected.rights.mayRead || !selected.rights.mayWrite || !selected.rights.maySend || flagBusy || flagUncertain) return;
    setComposeInitial({
      fromAddress: message.from.email,
      to: message.to.join(", "),
      cc: (message.cc ?? []).join(", "),
      bcc: (message.bcc ?? []).join(", "),
      subject: message.subject,
      body: message.bodyText ?? message.body.join("\n\n"),
      htmlBody: asPlainText ? null : message.htmlBody,
      inReplyTo: message.inReplyTo ?? [],
      references: message.references ?? [],
      attachments: (message.attachments ?? []).map(({ blobId, name, type, size, disposition, cid }) => ({ blobId, name, type, size, disposition, cid })),
      previousDraftId: message.id,
    });
    setComposingAccountId(selected.id);
  }

  return (
    <WorkspaceLayout title={t("title")} className="overflow-y-auto bg-(--surface-muted)">
      <section aria-label={t("sharedMailboxes")} className="mx-auto w-full max-w-[100rem] p-3 sm:p-5">
        <header className="workspace-page-header mb-5 min-w-0 gap-3">
          {selected ? <AccountIcon name={selected.displayName || selected.address} targetAccountId={selected.id} size="lg" editable /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary)/10 text-(--color-primary-ink)"><Users size={22} aria-hidden="true" /></span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{selected ? selected.displayName || selected.address : t("sharedMailboxes")}</h1>
            {selected ? <p className="truncate text-xs text-(--text-muted)">{selected.address}</p> : null}
          </div>
          {selected && !selected.rights.mayWrite ? <span className="shrink-0 rounded-md border border-(--border-app) bg-background px-2 py-1 text-xs text-(--text-muted)">{live("read")}</span> : null}
        </header>
        {selected ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={flagBusy || flagUncertain} onClick={() => { pendingAutoRead.clear(); setSelected(null); setMessage(null); setStatus("loading"); setAttempt((value) => value + 1); }} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-50 dark:hover:bg-white/5"><ChevronLeft size={17} aria-hidden="true" />{live("back")}</button>
              {selected.rights.mayRead && selected.rights.mayWrite && selected.rights.maySend ? <button type="button" onClick={() => { setComposeInitial(null); setComposingAccountId(selected.id); }} className="rounded-lg bg-(--color-primary-solid) px-3 py-2 text-sm font-semibold text-white">{compose("newMail")}</button> : null}
            </div>
            <form role="search" className="mb-4 flex min-w-0 items-center gap-2 rounded-xl border border-(--border-app) bg-background px-3 py-1" onSubmit={(event) => {
              event.preventDefault();
              if (flagBusy || flagUncertain || mutationInFlight.current) return;
              pendingAutoRead.clear();
              preserveMessageOnRefresh.current = null;
              setMessage(null);
              setPosition(0);
              setPageStatus("loading");
              setSearchQuery(searchInput.trim());
              setPageAttempt((value) => value + 1);
            }}>
              <Search size={18} aria-hidden="true" className="shrink-0 text-(--text-muted)" />
              <input type="search" maxLength={256} value={searchInput} disabled={flagBusy || flagUncertain}
                onChange={(event) => setSearchInput(event.target.value)} aria-label={topBar("searchPlaceholder")}
                placeholder={topBar("searchPlaceholder")} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-50" />
              <button type="submit" disabled={flagBusy || flagUncertain} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-(--color-primary-ink) hover:bg-(--surface-muted) focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-50">{nav("search")}</button>
            </form>
            {selected.rights.mayRead && selected.rights.mayWrite && selected.rights.maySend ? <ScheduledSubmissions key={selected.id} accountId={selected.id} className="mb-4" /> : null}
            {flagUncertain ? <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-(--border-app) bg-(--status-warning-bg) p-4 text-sm">
              <p className="flex-1">{live("flagUncertain")}</p>
              <button type="button" disabled={pageStatus !== "ready"} onClick={() => setFlagUncertain(false)} className="rounded-lg border border-(--border-app) px-3 py-2 disabled:opacity-50">{live("reviewed")}</button>
            </div> : null}
            {pageStatus === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
            {pageStatus !== "loading" && pageStatus !== "ready" ? (
              <SystemErrorNotice message={pageStatus === "invalid_request" ? search("invalidQuery") : service(pageStatus)} actionLabel={service("retry")} onAction={() => { setPageStatus("loading"); setPageAttempt(value => value + 1); }} />
            ) : null}
            {pageStatus === "ready" && page ? (
              <div className="grid min-w-0 gap-3 xl:grid-cols-[10rem_minmax(0,1fr)]">
                <nav aria-label={live("folders")} className="flex min-w-0 gap-1 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
                  {page.mailboxes.map((folder) => (
                    <button key={folder.id} type="button" disabled={flagBusy || flagUncertain} aria-current={page.mailboxId === folder.id ? "page" : undefined}
                      onClick={() => { pendingAutoRead.clear(); setMailboxId(folder.id); setPosition(0); setPageStatus("loading"); }}
                      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-50 ${page.mailboxId === folder.id ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "hover:bg-background"}`}>
                      <Folder size={16} aria-hidden="true" className="shrink-0" /><span className="truncate">{mailboxLabel(folder.role, folder.name, sidebar)}</span><span className="ml-auto text-xs tabular-nums text-(--text-muted)">{folder.unreadEmails}</span>
                    </button>
                  ))}
                </nav>
                <div className="grid min-w-0 overflow-hidden rounded-xl border border-(--border-app) bg-background lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)]">
                  <div className={`min-w-0 lg:border-r lg:border-(--border-app) ${message ? "hidden lg:block" : ""}`}>
                    <header className="flex h-14 items-center justify-between border-b border-(--border-app) px-4 text-sm">
                      <span className="truncate font-semibold">{mailboxLabel(page.mailboxes.find(folder => folder.id === page.mailboxId)?.role ?? null, page.mailboxes.find(folder => folder.id === page.mailboxId)?.name ?? "", sidebar)}</span>
                      <span className="ml-2 shrink-0 text-xs tabular-nums text-(--text-muted)">{mailList("countUnit", { count: page.total })}</span>
                    </header>
                    {page.messages.length ? <ul className="max-h-[65dvh] divide-y divide-(--border-app) overflow-y-auto">{page.messages.map((item) => (
                      <li key={item.id}><button type="button" disabled={flagBusy || flagUncertain} aria-current={message?.id === item.id ? "true" : undefined} onClick={() => {
                        pendingAutoRead.clear(); setMessage(item);
                        setDetailStatus(item.detailLoaded === false ? "loading" : "ready"); setFlagError(null);
                        if (item.unread && selected.rights.mayWrite) {
                          if (item.detailLoaded === false) pendingAutoRead.schedule(`${selected.id}:${item.id}`, () => { void toggleFlag("seen", item); });
                          else void toggleFlag("seen", item);
                        }
                      }} className={`w-full px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-(--color-primary) disabled:opacity-50 ${message?.id === item.id ? "bg-(--color-primary)/10" : "hover:bg-(--surface-muted)"}`}>
                        <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-sm ${item.unread ? "font-semibold" : "font-medium"}`}>{item.from.name || item.from.email}</span><time dateTime={item.receivedAt} className="shrink-0 text-[11px] tabular-nums text-(--text-muted)">{formatTimestamp(item.receivedAt)}</time>{item.unread ? <span className="size-1.5 shrink-0 rounded-full bg-(--color-primary-solid)" /> : null}</span>
                        <span className={`mt-1 block truncate text-sm ${item.unread ? "font-medium" : "text-(--text-muted)"}`}>{item.subject || mailList("noSubject")}</span>
                        <span className="mt-0.5 block truncate text-xs text-(--text-muted)">{item.preview}</span>
                      </button></li>
                    ))}</ul> : <p className="p-5 text-sm text-(--text-muted)">{live("noMessages")}</p>}
                    {page.total > page.limit ? <div className="flex items-center justify-between border-t border-(--border-app) p-3 text-xs">
                      <button type="button" disabled={flagBusy || flagUncertain || position === 0} onClick={() => { setPosition(Math.max(0, position - page.limit)); setPageStatus("loading"); }} className="min-h-11 px-2 disabled:opacity-40">{live("previous")}</button>
                      <span className="tabular-nums text-(--text-muted)">{position + 1}–{Math.min(position + page.limit, page.total)} / {page.total}</span>
                      <button type="button" disabled={flagBusy || flagUncertain || position + page.limit >= page.total} onClick={() => { setPosition(position + page.limit); setPageStatus("loading"); }} className="min-h-11 px-2 disabled:opacity-40">{live("next")}</button>
                    </div> : null}
                  </div>
                  <div className={`min-w-0 ${message ? "" : "hidden lg:block"}`}>
                  {message?.detailLoaded === false ? (
                    <article className="p-4 sm:p-6">
                      <button type="button" onClick={() => { pendingAutoRead.clear(); setMessage(null); setFlagError(null); }} className="mb-4 text-sm text-(--color-primary-ink)">{live("backToMessages")}</button>
                      <h2 className="text-lg font-semibold">{message.subject}</h2>
                      <p role={detailStatus === "loading" || detailStatus === "ready" ? "status" : "alert"} className="mt-4 text-sm text-(--text-muted)">{service(detailStatus === "ready" ? "loading" : detailStatus)}</p>
                      {detailStatus !== "loading" && detailStatus !== "ready" ? <button type="button" onClick={() => { setDetailStatus("loading"); setDetailAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2 text-sm">{service("retry")}</button> : null}
                    </article>
                  ) : message ? (
                    <article className="p-4 sm:p-6">
                      <button type="button" disabled={flagBusy || flagUncertain} onClick={() => { pendingAutoRead.clear(); setMessage(null); setFlagError(null); }} className="mb-4 text-sm text-(--color-primary-ink) disabled:opacity-50">{live("backToMessages")}</button>
                      <h2 className="text-lg font-semibold">{message.subject}</h2>
                      <p className="mt-2 wrap-anywhere text-xs leading-5 text-(--text-muted)">{message.from.name} &lt;{message.from.email}&gt; · <time dateTime={message.receivedAt}>{formatDetailTimestamp(message.receivedAt)}</time></p>
                      <MailDeliveryDetails key={`${selected.id}:${message.id}`} message={message} />
                      {selected.rights.mayWrite ? <div className="mt-4">
                        <div className="flex flex-wrap gap-2">
                          {selected.rights.mayRead && selected.rights.maySend ? <>
                            <IconButton label={reading("reply")} icon={<Reply size={18} />} disabled={flagBusy || flagUncertain || Boolean(composingAccountId)} onClick={() => replySelectedMessage(false)} />
                            <IconButton label={reading("replyAll")} icon={<ReplyAll size={18} />} disabled={flagBusy || flagUncertain || Boolean(composingAccountId)} onClick={() => replySelectedMessage(true)} />
                            <IconButton label={reading("forward")} icon={<Forward size={18} />} disabled={flagBusy || flagUncertain || Boolean(composingAccountId)} onClick={forwardSelectedMessage} />
                          </> : null}
                          <button type="button" disabled={flagBusy || flagUncertain} onClick={() => toggleFlag("seen")} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{mailList(message.unread ? "markRead" : "markUnread")}</button>
                          <button type="button" disabled={flagBusy || flagUncertain} onClick={() => toggleFlag("starred")} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{message.starred ? live("unstar") : mailList("markImportant")}</button>
                          {selected.rights.mayRead && selected.rights.maySend && page.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role === "drafts") ?
                            <button type="button" disabled={flagBusy || flagUncertain} onClick={() => {
                              if (message.htmlBody && draftRequiresPlainTextConfirmation(message.htmlBody, message.attachments)) setConfirmingPlainTextEdit(true);
                              else editSelectedDraft();
                            }} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{reading("editDraft")}</button> : null}
                          {page.mailboxes.some((folder) => folder.id !== page.mailboxId && (folder.role === null || ["inbox", "archive", "junk", "trash"].includes(folder.role))) ?
                            <Dropdown value="" label={mailList("moveToFolder")} disabled={flagBusy || flagUncertain}
                              options={[{ value: "", label: mailList("moveToFolder"), disabled: true },
                                ...page.mailboxes.filter((folder) => folder.id !== page.mailboxId &&
                                  (folder.role === null || ["inbox", "archive", "junk", "trash"].includes(folder.role)))
                                  .map((folder) => ({ value: folder.id, label: mailboxLabel(folder.role, folder.name, sidebar) }))]}
                              onChange={(mailboxId) => { void moveSelectedMessage({ mailboxId }); }} /> : null}
                          {page.mailboxes.some((folder) => folder.role === "trash") && page.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role !== "trash") ?
                            <button type="button" disabled={flagBusy || flagUncertain} onClick={() => moveSelectedMessage("trash")} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{mailList("delete")}</button> : null}
                          {page.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role === "trash") && page.mailboxes.some((folder) => folder.role === "inbox") ?
                            <button type="button" disabled={flagBusy || flagUncertain} onClick={() => moveSelectedMessage("inbox")} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{mailList("restoreToInbox")}</button> : null}
                          {page.mailboxes.some((folder) => folder.id === page.mailboxId && folder.role === "trash") ?
                            <button type="button" disabled={flagBusy || flagUncertain} onClick={() => setConfirmingDelete(true)} className="rounded-lg border border-(--border-app) px-3 py-2 text-sm text-(--status-danger) disabled:opacity-50">{mailList("permanentDelete")}</button> : null}
                        </div>
                        {flagError ? <SystemErrorNotice message={service(flagError)} /> : null}
                      </div> : null}
                      {message.htmlBody ? <LiveHtmlMessageBody key={`${selected.id}:${message.id}`} html={message.htmlBody} subject={message.subject} senderEmail={message.from.email} blockedExternalImages={message.blockedExternalImages} attachments={message.attachments} accountId={selected.id} /> :
                        <div className="mt-6 space-y-4 whitespace-pre-wrap text-sm">{message.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
                      {message.attachments?.length ? <ul className="mt-6 border-t border-(--border-app) pt-4 text-sm">{message.attachments.map((attachment) => <li key={attachment.blobId}>
                        <a href={`/api/mail/attachments?${new URLSearchParams({ accountId: selected.id, blobId: attachment.blobId })}`} className="text-(--color-primary-ink) underline-offset-2 hover:underline focus-visible:underline">{attachment.name}</a>
                      </li>)}</ul> : null}
                    </article>
                  ) : <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-sm text-(--text-muted)"><Mail size={36} strokeWidth={1.5} aria-hidden="true" /><p>{reading("selectPrompt")}</p></div>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : <>
        {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? (
          <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => { setStatus("loading"); setAttempt(value => value + 1); }} />
        ) : null}
        {status === "ready" && items.length === 0 ? <p className="rounded-xl border border-(--border-app) bg-background p-5 text-sm text-(--text-muted)">{live("empty")}</p> : null}
        {status === "ready" ? (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {items.map((mailbox) => {
              const percent = mailbox.quotaBytes > 0 ? Math.min(100, Math.round(mailbox.usedBytes / mailbox.quotaBytes * 100)) : 0;
              return (
                <li key={mailbox.id} className="min-w-0 rounded-xl border border-(--border-app) bg-background p-4 transition-colors hover:border-(--color-primary)/40 sm:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountIcon name={mailbox.displayName || mailbox.address} targetAccountId={mailbox.id} editable />
                    <h2 className="min-w-0 flex-1 font-semibold">{mailbox.rights.mayRead ? <button type="button" onClick={() => openMailbox(mailbox)} className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left text-(--color-primary-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"><span className="min-w-0 flex-1 truncate">{mailbox.displayName || mailbox.address}</span><ChevronRight size={18} aria-hidden="true" className="shrink-0 text-(--text-muted)" /></button> : <span className="block truncate">{mailbox.displayName || mailbox.address}</span>}</h2>
                  </div>
                  <p className="mt-1 break-all text-xs text-(--text-muted)">{mailbox.address}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                    {!mailbox.rights.mayRead ? <span className="rounded-full bg-(--status-danger-bg) px-2 py-1 text-(--status-danger)">{service("forbidden")}</span> : null}
                    {mailbox.rights.mayRead && !mailbox.rights.mayWrite && !mailbox.rights.maySend && !mailbox.rights.mayManage ? <span className="rounded-full border border-(--border-app) px-2 py-1">{live("readOnly")}</span> : null}
                    {mailbox.rights.mayRead ? <span className="rounded-full bg-(--color-primary)/10 px-2 py-1">{live("read")}</span> : null}
                    {mailbox.rights.mayWrite ? <span className="rounded-full bg-(--color-primary)/10 px-2 py-1">{live("write")}</span> : null}
                    {mailbox.rights.maySend ? <span className="rounded-full bg-(--color-primary)/10 px-2 py-1">{live("send")}</span> : null}
                    {mailbox.rights.mayManage ? <span className="rounded-full bg-(--color-primary)/10 px-2 py-1">{live("manage")}</span> : null}
                  </div>
                  {mailbox.quotaBytes > 0 ? (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-(--text-muted)"><span>{live("storage")}</span><span>{new Intl.NumberFormat(locale).format(percent)}%</span></div>
                      <progress value={Math.min(mailbox.usedBytes, mailbox.quotaBytes)} max={mailbox.quotaBytes} aria-label={`${mailbox.address} ${live("storage")}`} className="h-1.5 w-full accent-(--color-primary)" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        </>}
      </section>
      {composingAccountId ? <SharedComposeModal key={composingAccountId} accountId={composingAccountId} initial={composeInitial} onClose={() => { setComposingAccountId(null); setComposeInitial(null); }} onSubmitted={() => { setPageStatus("loading"); setPageAttempt((value) => value + 1); }} /> : null}
      {confirmingDelete ? <ConfirmDialog
        tone="destructive"
        title={mailList("confirmPermDeleteTitle")}
        description={mailList("confirmPermDeleteDesc")}
        confirmLabel={mailList("permanentDelete")}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => { setConfirmingDelete(false); void destroySelectedMessage(); }}
      /> : null}
      {confirmingPlainTextEdit ? <ConfirmDialog
        tone="warning"
        title={reading("editDraftAsTextTitle")}
        description={reading("editDraftAsTextDescription")}
        confirmLabel={reading("editDraft")}
        onCancel={() => setConfirmingPlainTextEdit(false)}
        onConfirm={() => { setConfirmingPlainTextEdit(false); editSelectedDraft(true); }}
      /> : null}
    </WorkspaceLayout>
  );
}
