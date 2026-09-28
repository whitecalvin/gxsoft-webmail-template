"use client";

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ComposeDraft, Email, FolderId } from "@/types/mail";
import { MOCK_EMAILS } from "@/lib/mock-mails";
import { CURRENT_USER } from "@/lib/current-user";
import type { LiveMailPage, LiveMailbox, LiveMailboxSummary } from "@/lib/tastemail/mail";
import { usePathname } from "@/i18n/navigation";

type MailLoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";

// Mock data stays local; live pages are loaded through same-origin API routes.
interface MailContextValue {
  mode: "mock" | "live";
  accountAddress: string | null;
  loadStatus: MailLoadStatus;
  mailboxSummaryStatus: MailLoadStatus;
  mailboxes: LiveMailbox[];
  pagePosition: number;
  pageTotal: number;
  pageLimit: number;
  setPagePosition: (position: number) => void;
  retryLoad: () => void;
  mutationStatus: Exclude<MailLoadStatus, "loading" | "ready"> | null;
  pendingMutationIds: string[];
  emails: Email[];
  visibleEmails: Email[];
  activeFolder: FolderId;
  activeCustomMailboxId: string | null;
  activeCustomMailboxName: string | null;
  selectedEmailId: string | null;
  selectedEmail: Email | null;
  unreadCounts: Record<FolderId, number>;
  composeDraft: ComposeDraft | null;
  composeSessionId: number;
  setActiveFolder: (folder: FolderId) => void;
  setActiveCustomMailbox: (mailboxId: string) => void;
  selectEmail: (id: string) => void;
  clearSelection: () => void;
  toggleStar: (id: string) => void;
  moveToTrash: (id: string) => void;
  moveToFolder: (id: string, folder: FolderId) => void;
  permanentlyDelete: (id: string) => void;
  openCompose: (draft?: Partial<ComposeDraft>) => void;
  closeCompose: () => void;
  sendEmail: (draft: ComposeDraft) => void;
}

const MailContext = createContext<MailContextValue | null>(null);
const EMPTY_MAILBOXES: LiveMailbox[] = [];
const WORKSPACE_ROUTES = new Set([
  "calendar", "contacts", "approvals", "quarantine", "search", "settings",
  "rules", "security", "accessibility", "shortcuts", "mailboxes", "files",
]);

export function MailProvider({ children, mode }: { children: ReactNode; mode: "mock" | "live" }) {
  const pathname = usePathname();
  const [emails, setEmails] = useState<Email[]>(() => mode === "mock" ? MOCK_EMAILS : []);
  const [activeFolder, setActiveFolder] = useState<FolderId>("inbox");
  const [activeCustomMailboxId, setActiveCustomMailboxId] = useState<string | null>(null);
  const [activeCustomMailboxName, setActiveCustomMailboxName] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<LiveMailbox[]>([]);
  const [accountAddress, setAccountAddress] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<MailLoadStatus>(mode === "mock" ? "ready" : "loading");
  const [summaryStatus, setSummaryStatus] = useState<MailLoadStatus>(mode === "mock" ? "ready" : "loading");
  const [pagePosition, setPagePosition] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLimit, setPageLimit] = useState(50);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [mutationStatus, setMutationStatus] = useState<Exclude<MailLoadStatus, "loading" | "ready"> | null>(null);
  const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([]);
  const pendingMutationRef = useRef(new Set<string>());
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [loadedMailboxKey, setLoadedMailboxKey] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  // Bumped on every openCompose() call so ComposeModal can key off it and
  // remount with a fresh internal state even when reopened with a new draft
  // while an old one was already open (e.g. "reply" clicked twice).
  const [composeSessionId, setComposeSessionId] = useState(0);
  const requestKey = `${pathname}|${activeFolder}|${activeCustomMailboxId ?? ""}|${pagePosition}|${loadAttempt}`;
  const summaryKey = `${pathname}|${loadAttempt}`;
  const pageCurrent = mode === "mock" || loadedRequestKey === requestKey;
  const mailboxesCurrent = mode === "mock" || (pathname === "/" ? pageCurrent : loadedMailboxKey === summaryKey);
  const visibleMailboxes = mailboxesCurrent ? mailboxes : EMPTY_MAILBOXES;
  const currentLoadStatus: MailLoadStatus = pageCurrent ? loadStatus : "loading";
  const currentSummaryStatus: MailLoadStatus = pathname === "/" ? currentLoadStatus : mailboxesCurrent ? summaryStatus : "loading";

  useEffect(() => {
    if (mode !== "live" || pathname !== "/") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ folder: activeFolder, position: String(pagePosition) });
    if (activeFolder === "custom" && activeCustomMailboxId) params.set("mailboxId", activeCustomMailboxId);
    fetch(`/api/mail/messages?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const failure = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof failure === "string" ? failure : "retryable");
        }
        return payload as LiveMailPage;
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (pagePosition > 0 && page.messages.length === 0 && page.total <= pagePosition && page.limit > 0) {
          setPagePosition(Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit);
          return;
        }
        setEmails(page.messages);
        setMailboxes(page.mailboxes);
        if (activeFolder === "custom") {
          setActiveCustomMailboxName(page.mailboxes.find((mailbox) => mailbox.id === activeCustomMailboxId)?.name ?? null);
        }
        setAccountAddress(page.username);
        setPageTotal(page.total);
        setPageLimit(page.limit);
        setLoadStatus("ready");
        setLoadedRequestKey(requestKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setEmails([]);
        setMailboxes([]);
        setAccountAddress(null);
        setPageTotal(0);
        setSelectedEmailId(null);
        setLoadStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as MailLoadStatus : "retryable");
        setLoadedRequestKey(requestKey);
      });
    return () => controller.abort();
  }, [mode, pathname, activeFolder, activeCustomMailboxId, pagePosition, loadAttempt, requestKey]);

  useEffect(() => {
    const route = pathname.split("/")[1] ?? "";
    if (mode !== "live" || !WORKSPACE_ROUTES.has(route)) return;
    const controller = new AbortController();
    fetch("/api/mail/mailboxes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof status === "string" ? status : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("mailboxes" in payload) || !Array.isArray(payload.mailboxes)) {
          throw new Error("unavailable");
        }
        return payload as LiveMailboxSummary;
      })
      .then((summary) => {
        if (controller.signal.aborted) return;
        setMailboxes(summary.mailboxes);
        setSummaryStatus("ready");
        setLoadedMailboxKey(summaryKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setMailboxes([]);
        setSummaryStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as MailLoadStatus : "retryable");
        setLoadedMailboxKey(summaryKey);
      });
    return () => controller.abort();
  }, [mode, pathname, loadAttempt, summaryKey]);

  const visibleEmails = useMemo(() => {
    if (!pageCurrent) return [];
    if (activeFolder === "starred") {
      return emails.filter((e) => e.starred);
    }
    return emails.filter((e) => e.folder === activeFolder);
  }, [emails, activeFolder, pageCurrent]);

  const selectedEmail = useMemo(
    () => pageCurrent ? emails.find((e) => e.id === selectedEmailId) ?? null : null,
    [emails, selectedEmailId, pageCurrent]
  );

  const unreadCounts = useMemo(() => {
    const counts: Record<FolderId, number> = {
      inbox: 0,
      starred: 0,
      drafts: 0,
      sent: 0,
      archive: 0,
      spam: 0,
      trash: 0,
      custom: 0,
    };
    if (mode === "live") {
      if (!mailboxesCurrent) return counts;
      for (const mailbox of visibleMailboxes) {
        const folder = mailbox.role === "junk" ? "spam" : mailbox.role;
        if (folder && folder in counts) counts[folder as FolderId] = mailbox.unreadEmails;
      }
      return counts;
    }
    for (const email of emails) {
      if (!email.unread) continue;
      counts[email.folder] += 1;
      // "starred" is a virtual folder (a cross-folder filter), so an unread
      // starred email counts toward both its real folder and this one.
      if (email.starred) counts.starred += 1;
    }
    return counts;
  }, [emails, visibleMailboxes, mode, mailboxesCurrent]);

  const setActiveFolderAndClear = (folder: FolderId) => {
    if (folder === "custom") return;
    setActiveFolder(folder);
    setActiveCustomMailboxId(null);
    setActiveCustomMailboxName(null);
    setSelectedEmailId(null);
    setPagePosition(0);
    setMutationStatus(null);
  };

  const selectCustomMailbox = (mailboxId: string) => {
    const mailbox = mailboxes.find((item) => item.id === mailboxId && item.role === null);
    if (mode !== "live" || !mailbox) return;
    setActiveCustomMailboxId(mailboxId);
    setActiveCustomMailboxName(mailbox.name);
    setActiveFolder("custom");
    setSelectedEmailId(null);
    setPagePosition(0);
    setMutationStatus(null);
  };

  const updateFlag = async (id: string, flag: "seen" | "starred", value: boolean) => {
    if (pendingMutationRef.current.has(id)) return;
    pendingMutationRef.current.add(id);
    setPendingMutationIds([...pendingMutationRef.current]);
    setMutationStatus(null);
    try {
      const response = await fetch("/api/mail/flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: id, flag, value }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof status === "string" ? status : "retryable");
      }
      // No optimistic mutation: refresh the list and counts only after Email/set confirms it.
      setLoadAttempt((attempt) => attempt + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      setMutationStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
        ? reason as Exclude<MailLoadStatus, "loading" | "ready"> : "retryable");
      setLoadAttempt((attempt) => attempt + 1);
    } finally {
      pendingMutationRef.current.delete(id);
      setPendingMutationIds([...pendingMutationRef.current]);
    }
  };

  const selectEmail = (id: string) => {
    setSelectedEmailId(id);
    if (mode === "live") {
      const email = emails.find((item) => item.id === id);
      if (email?.unread) void updateFlag(id, "seen", true);
      return;
    }
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, unread: false } : e))
    );
  };

  const toggleStar = (id: string) => {
    if (mode === "live") {
      const email = emails.find((item) => item.id === id);
      if (email) void updateFlag(id, "starred", !email.starred);
      return;
    }
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e))
    );
  };

  const moveLive = async (id: string, folder: Exclude<FolderId, "starred" | "custom">) => {
    if (pendingMutationRef.current.has(id)) return;
    pendingMutationRef.current.add(id);
    setPendingMutationIds([...pendingMutationRef.current]);
    setMutationStatus(null);
    try {
      const response = await fetch("/api/mail/move", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: id, target: folder }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof status === "string" ? status : "retryable");
      }
      setSelectedEmailId((current) => current === id ? null : current);
      setLoadAttempt((attempt) => attempt + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      setMutationStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
        ? reason as Exclude<MailLoadStatus, "loading" | "ready"> : "retryable");
      setLoadAttempt((attempt) => attempt + 1);
    } finally {
      pendingMutationRef.current.delete(id);
      setPendingMutationIds([...pendingMutationRef.current]);
    }
  };

  const moveToTrash = (id: string) => {
    if (mode === "live") { void moveLive(id, "trash"); return; }
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, folder: "trash" } : e))
    );
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const moveToFolder = (id: string, folder: FolderId) => {
    if (mode === "live") { if (folder !== "starred" && folder !== "custom") void moveLive(id, folder); return; }
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder } : e)));
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const permanentlyDelete = (id: string) => {
    if (mode === "live") return;
    setEmails((prev) => prev.filter((e) => e.id !== id));
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const openCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft({ to: "", subject: "", body: "", ...draft });
    setComposeSessionId((id) => id + 1);
  };

  const closeCompose = () => setComposeDraft(null);

  const sendEmail = (draft: ComposeDraft) => {
    if (mode === "live") return;
    const now = new Date().toISOString();
    // Recipient fields are freeform comma-separated text inputs, not chips
    // backed by an array, so they need to be parsed before being stored.
    const splitAddrs = (raw?: string) =>
      (raw ?? "")
        .split(",")
        .map((addr) => addr.trim())
        .filter(Boolean);
    const cc = splitAddrs(draft.cc);
    const newEmail: Email = {
      id: `sent-${Date.now()}`,
      folder: "sent",
      from: CURRENT_USER,
      to: splitAddrs(draft.to),
      ...(cc.length > 0 ? { cc } : {}),
      subject: draft.subject.trim(),
      preview: draft.body.slice(0, 80),
      body: draft.body.split("\n").filter((line) => line.length > 0),
      receivedAt: now,
      unread: false,
      starred: false,
    };
    setEmails((prev) => [newEmail, ...prev]);
    setComposeDraft(null);
  };

  const value: MailContextValue = {
    mode,
    accountAddress,
    loadStatus: currentLoadStatus,
    mailboxSummaryStatus: currentSummaryStatus,
    mailboxes: visibleMailboxes,
    pagePosition,
    pageTotal,
    pageLimit,
    setPagePosition: (position) => { setSelectedEmailId(null); setPagePosition(position); },
    retryLoad: () => { setSelectedEmailId(null); setLoadAttempt((attempt) => attempt + 1); },
    mutationStatus,
    pendingMutationIds,
    emails,
    visibleEmails,
    activeFolder,
    activeCustomMailboxId,
    activeCustomMailboxName,
    selectedEmailId,
    selectedEmail,
    unreadCounts,
    composeDraft,
    composeSessionId,
    setActiveFolder: setActiveFolderAndClear,
    setActiveCustomMailbox: selectCustomMailbox,
    selectEmail,
    clearSelection: () => setSelectedEmailId(null),
    toggleStar,
    moveToTrash,
    moveToFolder,
    permanentlyDelete,
    openCompose,
    closeCompose,
    sendEmail,
  };

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used within MailProvider");
  return ctx;
}
