"use client";

import { createContext, useContext, useCallback, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import type { ComposeDraft, Email, FolderId } from "@/types/mail";

import type { LiveMailbox, LiveMailboxSummary } from "@/lib/tastemail/mail";
import { MailMutationQueue } from "@/lib/tastemail/mutation-queue";
import { requireLiveSearchDetail as requireLiveMailDetail } from "@/lib/tastemail/search-page";
import { requireLiveMailboxSummary, requireLiveMailPage } from "@/lib/tastemail/mail-page";
import { clientMailFailure, isUncertainMailMutation, requireConfirmedMailMutation } from "@/lib/tastemail/client-session-status";
import { confirmMessageFlagInPage, isCurrentMailView, mailPageTransitionPosition, mailViewKey, mergeLoadedMailDetail, retainLoadedDetails, shouldRetainMailPage } from "@/lib/mail-view";
import { PendingAutoRead } from "@/lib/mail-auto-read";
import { confirmedMailSnapshot, projectMailboxUsageAfterDestroy, projectMailboxUsageAfterMove, projectPendingMailboxUsage, type PendingMailboxUsageMove } from "@/lib/mailbox-usage";
import { resolveMoveSource, movedMailboxIds } from "@/lib/mailbox-move.mjs";
import { usePathname } from "@/i18n/navigation";
import { personalFolderInput, personalFolderReceipt, type PersonalFolderChange } from "@/lib/tastemail/personal-folder-contract";
import { clientMutationFailure } from "@/lib/tastemail/client-session-status";
import { navigationCookieName, persistNavigationCookie, type MailSelection } from "@/lib/workspace-navigation";
import { MailboxRefreshRecovery } from "@/lib/mailbox-refresh-recovery";

type MailLoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "conflict";

// All account data is loaded through authenticated same-origin API routes.
interface MailContextValue {
  mode: "live";
  accountAddress: string | null;
  loadStatus: MailLoadStatus;
  mailboxSummaryStatus: MailLoadStatus;
  mailboxes: LiveMailbox[];
  pagePosition: number;
  pageTransitionPending: boolean;
  pageTotal: number;
  pageLimit: number;
  setPagePosition: (position: number) => void;
  retryLoad: () => void;
  refreshMailbox: () => void;
  refreshAttempt: number;
  refreshPending: boolean;
  refreshReceipt: { attempt: number; status: MailLoadStatus; viewKey: string };
  changeFolder: (change: PersonalFolderChange) => Promise<string | undefined>;
  folderChangePending: boolean;
  folderChangeUncertain: boolean;
  mutationStatus: Exclude<MailLoadStatus, "loading" | "ready"> | null;
  pendingMutationIds: string[];
  uncertainMutationIds: string[];
  emails: Email[];
  visibleEmails: Email[];
  activeFolder: FolderId;
  activeCustomMailboxId: string | null;
  activeCustomMailboxName: string | null;
  selectedEmailId: string | null;
  selectedEmail: Email | null;
  detailStatus: MailLoadStatus;
  retryDetail: () => void;
  unreadCounts: Record<FolderId, number>;
  allMailCounts: { total: number; unread: number } | null;
  composeDraft: ComposeDraft | null;
  composeSessionId: number;
  scheduledRevision: number;
  refreshScheduledSubmissions: () => void;
  setActiveFolder: (folder: FolderId) => void;
  setActiveCustomMailbox: (mailboxId: string) => void;
  selectEmail: (id: string) => void;
  clearSelection: () => void;
  setRead: (id: string, read: boolean) => void;
  toggleStar: (id: string) => void;
  moveToTrash: (id: string) => void;
  moveToFolder: (id: string, folder: FolderId) => void;
  moveToCustomMailbox: (id: string, mailboxId: string) => void;
  permanentlyDelete: (id: string) => void;
  openCompose: (draft?: Partial<ComposeDraft>) => void;
  closeCompose: () => void;
}

const MailContext = createContext<MailContextValue | null>(null);
const EMPTY_MAILBOXES: LiveMailbox[] = [];
const MAIL_PAGE_TIMEOUT_MS = 45_000;
const MAILBOX_SUMMARY_TIMEOUT_MS = 25_000;
const MAILBOX_SUMMARY_REFRESH_MS = 60_000;
const MAIL_MUTATION_TIMEOUT_MS = 45_000;
const WORKSPACE_ROUTES = new Set([
  "calendar", "contacts", "approvals", "quarantine", "search", "settings",
  "rules", "security", "accessibility", "shortcuts", "mailboxes", "files",
]);

export function MailProvider({ children, mode, initialMailboxSummary = null, loadWorkspaceData = true, initialSelection = { folder: "inbox", mailboxId: null }, navigationAccount }: {
  children: ReactNode;
  mode: "live";
  initialMailboxSummary?: LiveMailboxSummary | null;
  loadWorkspaceData?: boolean;
  initialSelection?: MailSelection;
  navigationAccount?: string;
}) {
  const pathname = usePathname();
  const [emails, setEmails] = useState<Email[]>(() => []);
  const confirmedUnread = useRef(new Map<string, boolean>());
  const [activeFolder, setActiveFolder] = useState<FolderId>(initialSelection.folder);
  const [activeCustomMailboxId, setActiveCustomMailboxId] = useState<string | null>(initialSelection.mailboxId);
  const [activeCustomMailboxName, setActiveCustomMailboxName] = useState<string | null>(initialMailboxSummary?.mailboxes.find(item => item.id === initialSelection.mailboxId)?.name ?? null);
  const [mailboxes, setMailboxes] = useState<LiveMailbox[]>(initialMailboxSummary?.mailboxes ?? []);
  const [allCounts, setAllCounts] = useState<LiveMailboxSummary["allCounts"]>(initialMailboxSummary?.allCounts);
  const [pendingUsageMoves, setPendingUsageMoves] = useState<PendingMailboxUsageMove[]>([]);
  const [accountAddress, setAccountAddress] = useState<string | null>(initialMailboxSummary?.username ?? null);
  const [loadStatus, setLoadStatus] = useState<MailLoadStatus>("loading");
  const [summaryStatus, setSummaryStatus] = useState<MailLoadStatus>(initialMailboxSummary ? "ready" : "loading");
  const [pagePosition, setPagePosition] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLimit, setPageLimit] = useState(50);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [refreshReceipt, setRefreshReceipt] = useState<{ attempt: number; status: MailLoadStatus; viewKey: string }>({ attempt: 0, status: "loading", viewKey: "" });
  const [mutationStatus, setMutationStatus] = useState<Exclude<MailLoadStatus, "loading" | "ready"> | null>(null);
  const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([]);
  const [uncertainMutationIds, setUncertainMutationIds] = useState<string[]>([]);
  const uncertainMutationIdSet = useRef(new Set<string>());
  const [mutationQueue] = useState(() => new MailMutationQueue(setPendingMutationIds));
  const [pendingAutoRead] = useState(() => new PendingAutoRead());
  const [loadedViewKey, setLoadedViewKey] = useState<string | null>(null);
  const lastSuccessfulViewKey = useRef<string | null>(null);
  const [loadedMailboxKey, setLoadedMailboxKey] = useState<string | null>(initialMailboxSummary ? "0" : null);
  const [mailboxSummaryLoadedAt, setMailboxSummaryLoadedAt] = useState(0);
  const [mailboxSummaryRefreshTick, setMailboxSummaryRefreshTick] = useState(0);
  const [summaryRecovery] = useState(() => new MailboxRefreshRecovery());
  const mailboxDataRevision = useRef(0);
  const folderChangeLock = useRef(false);
  const [folderChangePending, setFolderChangePending] = useState(false);
  const [folderChangeUncertain, setFolderChangeUncertain] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<MailLoadStatus>("ready");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  // Bumped on every openCompose() call so ComposeModal can key off it and
  // remount with a fresh internal state even when reopened with a new draft
  // while an old one was already open (e.g. "reply" clicked twice).
  const [composeSessionId, setComposeSessionId] = useState(0);
  const [scheduledRevision, setScheduledRevision] = useState(0);
  const refreshScheduledSubmissions = useCallback(() => setScheduledRevision((value) => value + 1), []);
  const refreshMailbox = () => {

    // Reuse the background page/summary loaders without clearing selection,
    // cached bodies, pagination, or the last confirmed quota.
    setLoadAttempt((attempt) => attempt + 1);
  };
  const changeFolder = async (change: PersonalFolderChange) => {
    if (folderChangeLock.current) throw new Error("conflict");
    const input = personalFolderInput(change);
    if (!input) throw new Error("invalid_request");
    const before = mailboxes;
    const revision = mailboxDataRevision.current;
    folderChangeLock.current = true;
    setFolderChangePending(true);
    let uncertain = false;
    try {
      const response = await fetch("/api/mail/folders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.timeout(45_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        if (status === "mutation_uncertain" || response.status === 408 || response.status >= 500) throw new Error("mutation_uncertain");
        throw new Error(clientMutationFailure(response.status, payload));
      }
      let receipt: LiveMailbox[];
      try {
        if (response.status !== 200) throw new Error();
        receipt = personalFolderReceipt(payload, input, before);
      } catch { throw new Error("mutation_uncertain"); }
      // Invalidate older page/summary reads, but do not overwrite a concurrent
      // message mutation's confirmed usage snapshot with the folder receipt.
      if (revision === mailboxDataRevision.current) {
        setMailboxes(receipt);
        setSummaryStatus("ready");
        setMailboxSummaryLoadedAt(Date.now());
      }
      mailboxDataRevision.current += 1;
      if (currentViewKey.current === viewKey && input.operation !== "create" && activeCustomMailboxId === input.mailboxId) {
        if (input.operation === "rename") setActiveCustomMailboxName(input.name);
        else {
          setActiveFolder("inbox"); setActiveCustomMailboxId(null); setActiveCustomMailboxName(null);
          if (navigationAccount) persistNavigationCookie(navigationCookieName("mail", navigationAccount), { folder: "inbox", mailboxId: null });
          setSelectedEmailId(null); setPagePosition(0); pendingAutoRead.clear();
        }
      }
      if (currentViewKey.current === viewKey && input.operation === "rename" && activeCustomMailboxId !== input.mailboxId) {
        const current = receipt.find(folder => folder.id === activeCustomMailboxId);
        if (current) setActiveCustomMailboxName(current.name);
      }
      refreshMailbox();
      return input.operation === "create" ? receipt.find(folder => folder.name === input.name && !before.some(old => old.id === folder.id))?.id : undefined;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "mutation_uncertain";
      uncertain = !["invalid_request", "not_found", "notFound", "unauthorized", "forbidden", "rateLimited", "conflict"].includes(reason);
      if (uncertain) {
        setFolderChangeUncertain(true);
        mailboxDataRevision.current += 1;
        refreshMailbox();
      }
      throw new Error(uncertain ? "mutation_uncertain" : reason);
    } finally {
      // Lost acknowledgements cannot establish rollback. Keep writes locked
      // for this provider lifetime; read-only refresh remains available.
      if (!uncertain) folderChangeLock.current = false;
      setFolderChangePending(false);
    }
  };
  // Route transitions must not invalidate mailbox data owned by this persistent provider.
  const viewKey = mailViewKey(activeFolder, activeCustomMailboxId, pagePosition);
  const currentViewKey = useRef(viewKey);
  useEffect(() => { currentViewKey.current = viewKey; }, [viewKey]);
  const summaryKey = String(loadAttempt);
  // 같은 편지함의 페이지 전환은 확인된 목록을 유지한 채 CSR로 갱신합니다.
  const transitionPosition = mailPageTransitionPosition(loadedViewKey, viewKey);
  const pageTransitionPending = transitionPosition !== null;
  const pageCurrent = isCurrentMailView(mode, loadedViewKey, viewKey) || pageTransitionPending;
  // Keep the last confirmed server summary visible while CSR refreshes it or
  // recovers from a transient failure. Auth failures must discard it.
  const mailboxesCurrent = mailboxes.length > 0 || loadedMailboxKey === summaryKey || summaryStatus === "ready";
  const visibleMailboxes = useMemo(() => mailboxesCurrent
    ? projectPendingMailboxUsage(mailboxes, pendingUsageMoves)
    : EMPTY_MAILBOXES, [mailboxesCurrent, mailboxes, pendingUsageMoves]);
  const currentLoadStatus: MailLoadStatus = pageCurrent ? loadStatus : "loading";
  const currentSummaryStatus: MailLoadStatus = mailboxesCurrent ? summaryStatus : "loading";

  useEffect(() => {
    if (!loadWorkspaceData || pathname !== "/") return;
    // Page responses also carry mailbox usage; avoid counting a pending move twice.
    if (pendingUsageMoves.length > 0) return;
    const startedAtRevision = mailboxDataRevision.current;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MAIL_PAGE_TIMEOUT_MS)]);
    const params = new URLSearchParams({ folder: activeFolder, position: String(pagePosition) });
    if (activeFolder === "custom" && activeCustomMailboxId) params.set("mailboxId", activeCustomMailboxId);
    fetch(`/api/mail/messages?${params}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveMailPage(payload);
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== mailboxDataRevision.current) {
          // A confirmed flag change may finish while a background page read
          // is pending. Do not let that older snapshot revert read/star state.
          setLoadAttempt((attempt) => attempt + 1);
          return;
        }
        if (pagePosition > 0 && page.messages.length === 0 && page.total <= pagePosition && page.limit > 0) {
          setPagePosition(Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit);
          return;
        }
        setEmails((current) => lastSuccessfulViewKey.current === viewKey
          ? retainLoadedDetails(current, page.messages) : page.messages);
        if (lastSuccessfulViewKey.current !== viewKey) {
          setSelectedEmailId((id) => page.messages.some((message) => message.id === id) ? id : null);
        }
        setMailboxes(page.mailboxes);
        confirmedUnread.current = new Map(page.messages.map((email) => [email.id, email.unread]));
        setAllCounts(page.allCounts);
        summaryRecovery.success();
        setSummaryStatus("ready");
        setLoadedMailboxKey(summaryKey);
        setMailboxSummaryLoadedAt(Date.now());
        if (activeFolder === "custom") {
          setActiveCustomMailboxName(page.mailboxes.find((mailbox) => mailbox.id === activeCustomMailboxId)?.name ?? null);
        }
        setAccountAddress(page.username);
        setPageTotal(page.total);
        setPageLimit(page.limit);
        setLoadStatus("ready");
        setRefreshReceipt({ attempt: loadAttempt, status: "ready", viewKey });
        lastSuccessfulViewKey.current = viewKey;
        setLoadedViewKey(viewKey);
        // A refresh can supply the full message before a pending detail request
        // completes. Whichever response first confirms the body may mark it read.
        pendingAutoRead.completeAvailable(page.messages);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== mailboxDataRevision.current) {
          setLoadAttempt((attempt) => attempt + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        const status: MailLoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as MailLoadStatus : "retryable";
        const retainPreviousPage = shouldRetainMailPage(lastSuccessfulViewKey.current, viewKey, status);
        if (!retainPreviousPage) {
          setEmails([]);
          setPageTotal(0);
          setSelectedEmailId(null);
          pendingAutoRead.clear();
        }
        // A message-list failure does not invalidate the independently loaded
        // mailbox summary. Keep the last confirmed quota during transient errors.
        if (status === "unauthorized" || status === "forbidden") {
          setMailboxes([]);
          setAccountAddress(null);
          setSummaryStatus(status);
          setLoadedMailboxKey(summaryKey);
        }
        setLoadStatus(status);
        const previousPosition = mailPageTransitionPosition(lastSuccessfulViewKey.current, viewKey);
        setRefreshReceipt({ attempt: loadAttempt, status, viewKey });
        if (retainPreviousPage && previousPosition !== null) setPagePosition(previousPosition);
        setLoadedViewKey(retainPreviousPage && previousPosition !== null ? lastSuccessfulViewKey.current : viewKey);
      });
    return () => controller.abort();
  }, [loadWorkspaceData, mode, pathname, activeFolder, activeCustomMailboxId, pagePosition, loadAttempt, viewKey, summaryKey, pendingAutoRead, pendingUsageMoves.length, summaryRecovery]);

  useEffect(() => {
    const route = pathname.split("/")[1] ?? "";
    if (!loadWorkspaceData || (pathname !== "/" && !WORKSPACE_ROUTES.has(route))) return;
    // Keep an in-flight click-time projection visible until its mutation is
    // settled; a concurrent Mailbox/get may already include that same move.
    if (pendingUsageMoves.length > 0 || pendingMutationIds.length > 0) return;
    const startedAtRevision = mailboxDataRevision.current;
    if (loadedMailboxKey === summaryKey) {
      const remaining = mailboxSummaryLoadedAt === 0 && mailboxSummaryRefreshTick === 0
        ? MAILBOX_SUMMARY_REFRESH_MS
        : summaryRecovery.delayMs - (Date.now() - mailboxSummaryLoadedAt);
      if (remaining > 0) {
        const timer = window.setTimeout(() => setMailboxSummaryRefreshTick((tick) => tick + 1), remaining);
        return () => window.clearTimeout(timer);
      }
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MAILBOX_SUMMARY_TIMEOUT_MS)]);
    fetch("/api/mail/mailboxes", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveMailboxSummary(payload);
      })
      .then((summary) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== mailboxDataRevision.current) {
          setMailboxSummaryRefreshTick((tick) => tick + 1);
          return;
        }
        setMailboxes(summary.mailboxes);
        setAllCounts(summary.allCounts);
        setAccountAddress(summary.username);
        summaryRecovery.success();
        setSummaryStatus("ready");
        setLoadedMailboxKey(summaryKey);
        setMailboxSummaryLoadedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== mailboxDataRevision.current) {
          setMailboxSummaryRefreshTick((tick) => tick + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        if (reason === "unauthorized" || reason === "forbidden") {
          setMailboxes([]);
          setAccountAddress(null);
        }
        const status: MailLoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as MailLoadStatus : "retryable";
        // 최초 조회·수동 갱신·인증/권한 실패는 즉시 알립니다. 기존 요약을 가진
        // 백그라운드 조회의 일시적 실패에만 짧은 복구 기회를 제공합니다.
        if (summaryRecovery.failure(status, mailboxes.length > 0 && loadedMailboxKey === summaryKey)) {
          setSummaryStatus(status);
        }
        setLoadedMailboxKey(summaryKey);
        setMailboxSummaryLoadedAt(Date.now());
      });
    return () => controller.abort();
  }, [loadWorkspaceData, mode, pathname, loadAttempt, summaryKey, loadedMailboxKey, mailboxSummaryLoadedAt, mailboxSummaryRefreshTick, summaryStatus, pendingUsageMoves, pendingMutationIds.length, summaryRecovery, mailboxes.length]);

  const visibleEmails = useMemo(() => {
    if (!pageCurrent) return [];
    if (activeFolder === "all") return emails;
    if (activeFolder === "starred") {
      return emails.filter((e) => e.starred);
    }
    return emails.filter((e) => e.folder === activeFolder);
  }, [emails, activeFolder, pageCurrent]);

  const selectedEmail = useMemo(
    () => pageCurrent ? emails.find((e) => e.id === selectedEmailId) ?? null : null,
    [emails, selectedEmailId, pageCurrent]
  );
  const pendingDetailId = selectedEmail?.detailLoaded === false ? selectedEmail.id : null;

  useEffect(() => {
    if (!loadWorkspaceData || pathname !== "/" || !pendingDetailId) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MAIL_PAGE_TIMEOUT_MS)]);
    fetch(`/api/mail/messages/${encodeURIComponent(pendingDetailId)}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveMailDetail(payload, pendingDetailId);
      })
      .then((detail) => {
        if (controller.signal.aborted) return;
        setEmails((current) => current.map((message) => message.id === pendingDetailId
          ? mergeLoadedMailDetail(message, detail) : message));
        setDetailStatus("ready");
        pendingAutoRead.complete(pendingDetailId);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const status: MailLoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as MailLoadStatus : "retryable";
        if (status === "unauthorized" || status === "forbidden") {
          setEmails([]);
          setSelectedEmailId(null);
          pendingAutoRead.clear();
          setPageTotal(0);
          setMailboxes([]);
          setAccountAddress(null);
          setSummaryStatus(status);
          setLoadedMailboxKey(summaryKey);
          setLoadStatus(status);
          lastSuccessfulViewKey.current = null;
        }
        setDetailStatus(status);
      });
    return () => controller.abort();
  }, [loadWorkspaceData, pathname, pendingDetailId, detailAttempt, loadAttempt, summaryKey, pendingAutoRead]);

  const unreadCounts = useMemo(() => {
    const counts: Record<FolderId, number> = {
      all: 0,
      inbox: 0,
      starred: 0,
      drafts: 0,
      sent: 0,
      archive: 0,
      spam: 0,
      trash: 0,
      custom: 0,
    };
    {
      if (!mailboxesCurrent) return counts;
      counts.all = allCounts?.unread ?? 0;
      for (const mailbox of visibleMailboxes) {
        const folder = mailbox.role === "junk" ? "spam" : mailbox.role;
        if (folder && folder in counts) counts[folder as FolderId] = mailbox.unreadEmails;
      }
      return counts;
    }

  }, [visibleMailboxes, mailboxesCurrent, allCounts]);

  const allMailCounts = accountAddress && mailboxesCurrent ? allCounts ?? null : null;

  const setActiveFolderAndClear = (folder: FolderId) => {
    if (folder === "custom") return;
    if (pathname === "/" && activeFolder === folder && activeCustomMailboxId === null) return;
    setActiveFolder(folder);
    if (navigationAccount) persistNavigationCookie(navigationCookieName("mail", navigationAccount), { folder, mailboxId: null });
    setActiveCustomMailboxId(null);
    setActiveCustomMailboxName(null);
    setSelectedEmailId(null);
    pendingAutoRead.clear();
    setPagePosition(0);
    setMutationStatus(null);
  };

  const selectCustomMailbox = (mailboxId: string) => {
    const mailbox = mailboxes.find((item) => item.id === mailboxId && item.role === null);
    if (!mailbox) return;
    if (pathname === "/" && activeFolder === "custom" && activeCustomMailboxId === mailboxId) return;
    setActiveCustomMailboxId(mailboxId);
    setActiveCustomMailboxName(mailbox.name);
    setActiveFolder("custom");
    if (navigationAccount) persistNavigationCookie(navigationCookieName("mail", navigationAccount), { folder: "custom", mailboxId });
    setSelectedEmailId(null);
    pendingAutoRead.clear();
    setPagePosition(0);
    setMutationStatus(null);
  };

  const enqueueLiveMutation = (id: string, key: string, operation: () => Promise<void>, showPending = true) => {
    mutationQueue.enqueue(id, key, operation, showPending);
  };

  const reportLiveMutationFailure = (error: unknown): Exclude<MailLoadStatus, "loading" | "ready"> => {
    const reason = error instanceof Error ? error.message : "retryable";
    const status: Exclude<MailLoadStatus, "loading" | "ready"> = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "conflict"].includes(reason)
      ? reason as Exclude<MailLoadStatus, "loading" | "ready"> : "retryable";
    setMutationStatus(status);
    if (status === "unauthorized" || status === "forbidden") {
      setEmails([]);
      setSelectedEmailId(null);
      setMailboxes([]);
      setAccountAddress(null);
      setLoadStatus(status);
      setSummaryStatus(status);
    }
    return status;
  };

  const updateFlag = (id: string, flag: "seen" | "starred", value: boolean, showPending = flag !== "seen" || !value) => {
    if (uncertainMutationIdSet.current.has(id)) return;
    const mailboxIds = emails.find((email) => email.id === id)?.mailboxIds ?? [];
    enqueueLiveMutation(id, `${id}:flag:${flag}:${value}`, async () => {
      if (uncertainMutationIdSet.current.has(id)) return;
      // Opening a message marks it as read silently; keep any earlier mutation error visible.
      if (showPending) setMutationStatus(null);
      try {
        const response = await fetch("/api/mail/flags", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId: id, flag, value }),
          signal: AbortSignal.timeout(MAIL_MUTATION_TIMEOUT_MS),
        });
        await requireConfirmedMailMutation(response, "updated");
        // Invalidate page and mailbox reads started before this confirmation.
        // The page callback retries only if such a read actually arrives;
        // opening an unread message still avoids an unconditional list reload.
        mailboxDataRevision.current += 1;
        if (flag === "seen") {
          const before = confirmedUnread.current.get(id);
          if (before === value) {
            setAllCounts((current) => current ? { ...current, unread: Math.max(0, Math.min(current.total, current.unread + (value ? -1 : 1))) } : current);
            // 서버가 확정한 상태 변경만 반영하여 중복 응답의 이중 차감을 막는다.
            setMailboxes((current) => current.map((mailbox) => mailboxIds.includes(mailbox.id)
              ? { ...mailbox, unreadEmails: Math.max(0, Math.min(mailbox.totalEmails, mailbox.unreadEmails + (value ? -1 : 1))) }
              : mailbox));
          }
          if (before !== undefined) confirmedUnread.current.set(id, !value);
        }
        if (flag === "starred" && !value && activeFolder === "starred") {
          // The row leaves the virtual starred folder; reconcile its page total.
          setLoadAttempt((attempt) => attempt + 1);
        } else {
          // Read/unread and stars do not change this date-sorted page. Keep the
          // selected message and list mounted after the server confirms them.
          setEmails((current) => confirmMessageFlagInPage(current, id, flag, value));
        }
        setLoadedMailboxKey(null);
      } catch (error) {
        const status = reportLiveMutationFailure(error);
        if (status === "unauthorized" || status === "forbidden") {
          setLoadAttempt((attempt) => attempt + 1);
          return;
        }
        // A failed automatic read has not changed local data; leave the open
        // message and list in place. Other flag changes still reconcile via reload.
        if (flag !== "seen" || !value) setLoadAttempt((attempt) => attempt + 1);
      }
    }, showPending);
  };

  const selectEmail = (id: string) => {
    setSelectedEmailId(id);
    {
      const email = emails.find((item) => item.id === id);
      setDetailStatus(email?.detailLoaded === false ? "loading" : "ready");
      if (email?.unread && email.detailLoaded === false) pendingAutoRead.schedule(id, () => updateFlag(id, "seen", true));
      else pendingAutoRead.clear();
      if (email?.unread && email.detailLoaded !== false) void updateFlag(id, "seen", true);
      return;
    }

  };

  const toggleStar = (id: string) => {
    {
      const email = emails.find((item) => item.id === id);
      if (email) void updateFlag(id, "starred", !email.starred);
      return;
    }

  };

  const setRead = (id: string, read: boolean) => {
    {
      pendingAutoRead.clear(id);
      const email = emails.find((item) => item.id === id);
      if (email && email.unread === read) void updateFlag(id, "seen", read, true);
      return;
    }

  };

  const moveLive = (id: string, target: Exclude<FolderId, "starred" | "custom"> | { mailboxId: string }) => {
    if (uncertainMutationIdSet.current.has(id) || mutationQueue.hasVisiblePending(id)) return;
    const sourceViewKey = viewKey;
    const destination = typeof target === "string" ? target : target.mailboxId;
    const sourceRole = activeFolder === "spam" ? "junk" : activeFolder;
    const selectedMailbox = mailboxes.find(mailbox => mailbox.id === activeCustomMailboxId);
    const memberships = emails.find(email => email.id === id)?.mailboxIds ?? [];
    // 상위 편지함의 통합 목록에서는 실제 메일이 들어 있는 하위 편지함을 이동 출발지로 사용합니다.
    const sourceMailboxId = activeFolder === "custom" ? (memberships.includes(activeCustomMailboxId ?? "") ? activeCustomMailboxId
      : mailboxes.find(mailbox => mailbox.role === null && selectedMailbox && mailbox.name.startsWith(`${selectedMailbox.name}/`) && memberships.includes(mailbox.id))?.id ?? activeCustomMailboxId)
      : mailboxes.find(mailbox => mailbox.role === sourceRole)?.id ?? null;
    const snapshot = confirmedMailSnapshot(emails.find((email) => email.id === id));
    if (snapshot) {
      // Invalidate in-flight mailbox reads so they cannot overwrite the
      // click-time projection before this move is confirmed or rejected.
      mailboxDataRevision.current += 1;
      setPendingUsageMoves((current) => current.some((move) => move.id === id) ? current
        : [...current, { id, snapshot, target, sourceMailboxId }]);
    }
    enqueueLiveMutation(id, `${id}:move:${destination}`, async () => {
      if (uncertainMutationIdSet.current.has(id)) return;
      setMutationStatus(null);
      try {
        const response = await fetch("/api/mail/move", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId: id, ...(typeof target === "string" ? { target } : { target: "custom", mailboxId: target.mailboxId }),
            ...(sourceMailboxId ? { sourceMailboxId } : {}) }),
          signal: AbortSignal.timeout(MAIL_MUTATION_TIMEOUT_MS),
        });
        const receipt = await requireConfirmedMailMutation(response, "updated");
        mailboxDataRevision.current += 1;
        setMailboxes((current) => projectMailboxUsageAfterMove(current, confirmedMailSnapshot(receipt.snapshot), target, sourceMailboxId));
        setPendingUsageMoves((current) => current.filter((move) => move.id !== id));
        // Reflect a confirmed move immediately. The background refresh then
        // fills the page and reconciles the server's authoritative total.
        if (currentViewKey.current === sourceViewKey) {
          if (activeFolder === "all") {
            setEmails((current) => current.map(message => message.id === id ? {
              ...message, folder: typeof target === "string" ? target : "custom",
              mailboxIds: (() => {
                const before = confirmedMailSnapshot(receipt.snapshot)?.mailboxIds;
                const source = before && resolveMoveSource(mailboxes, before, sourceMailboxId);
                const targetRole = typeof target === "string" ? target === "spam" ? "junk" : target : null;
                const destinationId = typeof target === "string" ? mailboxes.find(mailbox => mailbox.role === targetRole)?.id : target.mailboxId;
                return before && source && destinationId ? movedMailboxIds(before, source, destinationId) : message.mailboxIds;
              })(),
            } : message));
          } else {
            setEmails((current) => current.filter((message) => message.id !== id));
            setSelectedEmailId((current) => current === id ? null : current);
          }
        }
        setLoadAttempt((attempt) => attempt + 1);
      } catch (error) {
        setPendingUsageMoves((current) => current.filter((move) => move.id !== id));
        if (!isUncertainMailMutation(error)) reportLiveMutationFailure(error);
        else {
          uncertainMutationIdSet.current.add(id);
          setUncertainMutationIds([...uncertainMutationIdSet.current]);
          setMutationStatus("retryable");
        }
        setLoadAttempt((attempt) => attempt + 1);
      }
    });
  };

  const moveToTrash = (id: string) => {
    { void moveLive(id, "trash"); return; }

  };

  const moveToFolder = (id: string, folder: FolderId) => {
    if (folder === "all") return;
    { if (folder !== "starred" && folder !== "custom") void moveLive(id, folder); return; }

  };

  const moveToCustomMailbox = (id: string, mailboxId: string) => {
    if (!mailboxes.some((item) => item.id === mailboxId && item.role === null)) return;
    void moveLive(id, { mailboxId });
  };

  const permanentlyDelete = (id: string) => {
    {
      if (uncertainMutationIdSet.current.has(id) || mutationQueue.hasVisiblePending(id) ||
          !emails.some((email) => email.id === id && email.folder === "trash")) return;
      const sourceViewKey = viewKey;
      enqueueLiveMutation(id, `${id}:destroy`, async () => {
        if (uncertainMutationIdSet.current.has(id)) return;
        setMutationStatus(null);
        try {
          const response = await fetch("/api/mail/destroy", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messageId: id }),
            signal: AbortSignal.timeout(MAIL_MUTATION_TIMEOUT_MS),
          });
          const receipt = await requireConfirmedMailMutation(response, "destroyed");
          mailboxDataRevision.current += 1;
          setMailboxes((current) => projectMailboxUsageAfterDestroy(current, confirmedMailSnapshot(receipt.snapshot)));
          if (currentViewKey.current === sourceViewKey) {
            setEmails((current) => current.filter((message) => message.id !== id));
            setSelectedEmailId((current) => current === id ? null : current);
          }
          setLoadAttempt((attempt) => attempt + 1);
        } catch (error) {
          if (!isUncertainMailMutation(error)) reportLiveMutationFailure(error);
          else {
            uncertainMutationIdSet.current.add(id);
            setUncertainMutationIds([...uncertainMutationIdSet.current]);
            setMutationStatus("retryable");
          }
          setLoadAttempt((attempt) => attempt + 1);
        }
      });
      return;
    }

  };

  const openCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft({ to: "", subject: "", body: "", ...draft });
    setComposeSessionId((id) => id + 1);
  };

  const closeCompose = () => setComposeDraft(null);

  const value: MailContextValue = {
    mode,
    accountAddress,
    loadStatus: currentLoadStatus,
    mailboxSummaryStatus: currentSummaryStatus,
    mailboxes: visibleMailboxes,
    pagePosition: transitionPosition ?? pagePosition,
    pageTransitionPending,
    pageTotal,
    pageLimit,
    setPagePosition: (position) => { if (pageTransitionPending || position === pagePosition) return; pendingAutoRead.clear(); setPagePosition(position); },
    // A retry of the current mailbox must not close a message that is still
    // visible below the refresh error. Page changes clear it only after confirmation.
    retryLoad: () => { setDetailStatus("loading"); setLoadAttempt((attempt) => attempt + 1); },
    refreshMailbox,
    refreshAttempt: loadAttempt,
    refreshPending: pageCurrent && loadAttempt > refreshReceipt.attempt,
    refreshReceipt,
    changeFolder,
    folderChangePending,
    folderChangeUncertain,
    mutationStatus,
    pendingMutationIds,
    uncertainMutationIds,
    emails,
    visibleEmails,
    activeFolder,
    activeCustomMailboxId,
    activeCustomMailboxName,
    selectedEmailId,
    selectedEmail,
    detailStatus,
    retryDetail: () => { setDetailStatus("loading"); setDetailAttempt((attempt) => attempt + 1); },
    unreadCounts,
    allMailCounts,
    composeDraft,
    composeSessionId,
    scheduledRevision,
    refreshScheduledSubmissions,
    setActiveFolder: setActiveFolderAndClear,
    setActiveCustomMailbox: selectCustomMailbox,
    selectEmail,
    clearSelection: () => { setSelectedEmailId(null); pendingAutoRead.clear(); },
    setRead,
    toggleStar,
    moveToTrash,
    moveToFolder,
    moveToCustomMailbox,
    permanentlyDelete,
    openCompose,
    closeCompose,
  };

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used within MailProvider");
  return ctx;
}
