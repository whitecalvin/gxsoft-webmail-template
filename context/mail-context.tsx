"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ComposeDraft, Email, FolderId } from "@/types/mail";
import { MOCK_EMAILS } from "@/lib/mock-mails";
import { CURRENT_USER } from "@/lib/current-user";

// Global mail state for the whole app: inbox contents, the active
// folder/search, and the compose draft. Everything lives in React state
// seeded from MOCK_EMAILS — there is no backend, so a full page reload
// resets all mail data back to the mock seed.
interface MailContextValue {
  emails: Email[];
  visibleEmails: Email[];
  activeFolder: FolderId;
  selectedEmailId: string | null;
  selectedEmail: Email | null;
  unreadCounts: Record<FolderId, number>;
  composeDraft: ComposeDraft | null;
  composeSessionId: number;
  setActiveFolder: (folder: FolderId) => void;
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

export function MailProvider({ children }: { children: ReactNode }) {
  const [emails, setEmails] = useState<Email[]>(MOCK_EMAILS);
  const [activeFolder, setActiveFolder] = useState<FolderId>("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  // Bumped on every openCompose() call so ComposeModal can key off it and
  // remount with a fresh internal state even when reopened with a new draft
  // while an old one was already open (e.g. "reply" clicked twice).
  const [composeSessionId, setComposeSessionId] = useState(0);

  const visibleEmails = useMemo(() => {
    if (activeFolder === "starred") {
      return emails.filter((e) => e.starred);
    }
    return emails.filter((e) => e.folder === activeFolder);
  }, [emails, activeFolder]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId) ?? null,
    [emails, selectedEmailId]
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
    };
    for (const email of emails) {
      if (!email.unread) continue;
      counts[email.folder] += 1;
      // "starred" is a virtual folder (a cross-folder filter), so an unread
      // starred email counts toward both its real folder and this one.
      if (email.starred) counts.starred += 1;
    }
    return counts;
  }, [emails]);

  const setActiveFolderAndClear = (folder: FolderId) => {
    setActiveFolder(folder);
    setSelectedEmailId(null);
  };

  const selectEmail = (id: string) => {
    setSelectedEmailId(id);
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, unread: false } : e))
    );
  };

  const toggleStar = (id: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e))
    );
  };

  const moveToTrash = (id: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, folder: "trash" } : e))
    );
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const moveToFolder = (id: string, folder: FolderId) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder } : e)));
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const permanentlyDelete = (id: string) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
    setSelectedEmailId((current) => (current === id ? null : current));
  };

  const openCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft({ to: "", subject: "", body: "", ...draft });
    setComposeSessionId((id) => id + 1);
  };

  const closeCompose = () => setComposeDraft(null);

  const sendEmail = (draft: ComposeDraft) => {
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
    emails,
    visibleEmails,
    activeFolder,
    selectedEmailId,
    selectedEmail,
    unreadCounts,
    composeDraft,
    composeSessionId,
    setActiveFolder: setActiveFolderAndClear,
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
