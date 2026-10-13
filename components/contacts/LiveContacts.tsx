"use client";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { ChevronLeft, Mail } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useMobilePane } from "@/components/layout/useMobilePane";
import { clientMailFailure, clientMutationFailure } from "@/lib/tastemail/client-session-status";
import type { LiveContact } from "@/lib/tastemail/contacts";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type EditorMode = "new" | "edit" | null;
const MUTATION_ERRORS = new Set(["invalid_request", "conflict", "not_found", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);

function mutationFailureReason(error: unknown): string {
  return error instanceof Error && MUTATION_ERRORS.has(error.message) ? error.message : "retryable";
}

async function contactMutation(response: Response, expectedId?: string): Promise<LiveContact> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(clientMutationFailure(response.status, payload));
  }
  if (!payload || typeof payload !== "object" || !("contact" in payload) || !payload.contact ||
      typeof payload.contact !== "object" || !("id" in payload.contact) || typeof payload.contact.id !== "string" || !payload.contact.id ||
      (expectedId !== undefined && payload.contact.id !== expectedId)) {
    throw new Error("unavailable");
  }
  return payload.contact as LiveContact;
}

export function LiveContacts({ initialContacts }: { initialContacts?: LiveContact[] | null } = {}) {
  const t = useTranslations("contactsPage");
  const service = useTranslations("liveService");
  const importT = useTranslations("contactImport");
  const compose = useTranslations("composeModal");
  const { openCompose } = useMail();
  const [status, setStatus] = useState<LoadStatus>(initialContacts ? "ready" : "loading");
  const [contacts, setContacts] = useState<LiveContact[]>(initialContacts ?? []);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LiveContact | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [mutationUncertain, setMutationUncertain] = useState(false);
  const mutationBusyRef = useRef(false);
  const mutationUncertainRef = useRef(false);
  const contactDataRevision = useRef(0);

  useEffect(() => {
    if (initialContacts && attempt === 0) return;
    const startedAtRevision = contactDataRevision.current;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch("/api/mail/contacts", { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        if (!payload || typeof payload !== "object" || !("contacts" in payload) || !Array.isArray(payload.contacts)) {
          throw new Error("unavailable");
        }
        return payload.contacts as LiveContact[];
      })
      .then((items) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== contactDataRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        setContacts(items);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== contactDataRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        setContacts([]);
        setSelectedId(null);
        setPendingDelete(null);
        setEditorMode(null);
        setStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt, initialContacts]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? contacts.filter((contact) =>
      `${contact.displayName ?? ""} ${contact.email}`.toLocaleLowerCase().includes(term)) : contacts;
  }, [contacts, query]);
  const selected = visible.find((contact) => contact.id === selectedId) ?? null;
  useMobilePane(!!selected || !!editorMode, () => { setSelectedId(null); setEditorMode(null); setMutationError(""); });

  const mutationMessage = (reason: string) => reason === "conflict" ? importT("duplicateNotice") :
    reason === "invalid_request" ? t("liveInvalidContact") :
    reason === "not_found" ? t("liveContactMissing") :
    ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
      ? service(reason as LoadStatus) : service("retryable");

  const startEdit = (contact: LiveContact) => {
    setSelectedId(contact.id);
    setDisplayName(contact.displayName ?? "");
    setEmail(contact.email);
    setMutationError("");
    setEditorMode("edit");
  };

  const saveContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationBusyRef.current || mutationUncertainRef.current || busy || mutationUncertain || status !== "ready" || !editorMode) return;
    mutationBusyRef.current = true;
    setBusy(true);
    setMutationError("");
    try {
      const response = await fetch(editorMode === "new" ? "/api/mail/contacts" : `/api/mail/contacts/${encodeURIComponent(selectedId ?? "")}`, {
        method: editorMode === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ displayName: displayName.trim() || null, email: email.trim() }),
      });
      const saved = await contactMutation(response, editorMode === "edit" ? selectedId ?? "" : undefined);
      setContacts((items) => editorMode === "new" ? [saved, ...items] : items.map((item) => item.id === saved.id ? saved : item));
      setQuery("");
      setSelectedId(saved.id);
      setEditorMode(null);
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        mutationUncertainRef.current = true;
        setMutationUncertain(true);
        setStatus("loading");
        setAttempt((value) => value + 1);
      } else {
        setMutationError(mutationMessage(reason));
      }
    } finally {
      // A read started before either a confirmed or uncertain write must not
      // overwrite the result or count as the requested outcome review.
      contactDataRevision.current += 1;
      mutationBusyRef.current = false;
      setBusy(false);
    }
  };

  const removeContact = async (contact: LiveContact) => {
    if (mutationBusyRef.current || mutationUncertainRef.current || busy || mutationUncertain || status !== "ready" || !contacts.some((item) => item.id === contact.id)) return;
    mutationBusyRef.current = true;
    setPendingDelete(null);
    setBusy(true);
    setMutationError("");
    try {
      const response = await fetch(`/api/mail/contacts/${encodeURIComponent(contact.id)}`, { method: "DELETE", signal: AbortSignal.timeout(45_000) });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(clientMutationFailure(response.status, payload));
      }
      if (response.status !== 204) throw new Error("unavailable");
      setContacts((items) => items.filter((item) => item.id !== contact.id));
      setSelectedId(null);
      setEditorMode(null);
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        mutationUncertainRef.current = true;
        setMutationUncertain(true);
        setStatus("loading");
        setAttempt((value) => value + 1);
      } else {
        setMutationError(mutationMessage(reason));
      }
    } finally {
      contactDataRevision.current += 1;
      mutationBusyRef.current = false;
      setBusy(false);
    }
  };

  const reviewUncertainMutation = () => {
    if (mutationBusyRef.current || status !== "ready") return;
    if (editorMode === "new") {
      const existing = contacts.find((contact) => contact.email.toLowerCase() === email.trim().toLowerCase());
      if (existing) {
        setSelectedId(existing.id);
        setQuery("");
        setEditorMode(null);
      }
    } else if (editorMode === "edit") {
      const current = contacts.find((contact) => contact.id === selectedId);
      if (current && current.email.toLowerCase() === email.trim().toLowerCase() &&
          (current.displayName ?? "") === displayName.trim()) {
        setEditorMode(null);
      }
    }
    mutationUncertainRef.current = false;
    setMutationUncertain(false);
    setMutationError("");
  };

  const detail = editorMode ? (
    <form onSubmit={saveContact} className="space-y-4">
      <h2 className="text-lg font-semibold">{t(editorMode === "new" ? "newContact" : "editContact")}</h2>
      <label className="block text-sm"><span>{t("fields.name")}</span>
        <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} className="mt-1 app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
      </label>
      <label className="block text-sm"><span>{t("fields.email")}</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} className="mt-1 app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
      </label>
      {mutationError ? <p role="alert" className="text-sm text-red-600">{mutationError}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || mutationUncertain || status !== "ready"} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{t("save")}</button>
        <button type="button" disabled={busy} onClick={() => { setEditorMode(null); setMutationError(""); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{t("cancelChanges")}</button>
      </div>
    </form>
  ) : selected ? (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{selected.displayName || selected.email}</h2>
      <p className="break-all text-sm text-(--text-muted)">{t("fields.email")}: {selected.email}</p>
      {mutationError ? <p role="alert" className="text-sm text-red-600">{mutationError}</p> : null}
      <div className="flex flex-wrap gap-2 [&>button]:min-h-11">
        <button type="button" disabled={busy || status !== "ready"} onClick={() => openCompose({ to: selected.email })} className="flex items-center gap-2 rounded-(--radius-app) bg-(--color-primary-solid) px-3 py-2 text-sm text-white disabled:opacity-50"><Mail size={18} aria-hidden="true" />{compose("newMail")}</button>
        <button type="button" disabled={busy || mutationUncertain || status !== "ready"} onClick={() => startEdit(selected)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm">{t("editContact")}</button>
        <button type="button" disabled={busy || mutationUncertain || status !== "ready"} onClick={() => setPendingDelete(selected)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm text-red-600">{t("delete")}</button>
      </div>
    </div>
  ) : <p className="text-sm text-(--text-muted)">{t("selectPrompt")}</p>;

  return (
    <WorkspaceLayout title={t("title")} className="flex min-h-0 flex-col">
      {pendingDelete ? <ConfirmDialog
        tone="destructive"
        title={`${t("delete")} ${pendingDelete.displayName || pendingDelete.email}?`}
        confirmLabel={t("delete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void removeContact(pendingDelete)}
      /> : null}
      <section aria-label={t("myContacts")} className="flex min-h-0 flex-1 flex-col">
        <header className="workspace-page-header gap-3 border-b border-(--border-app) px-5 sm:px-6">
          <h1 className="min-w-0 truncate text-sm font-semibold">{t("myContacts")}</h1>
          {status === "ready" ? <span className="text-xs text-(--text-muted)">{t("myCount", { count: contacts.length })}</span> : null}
          {status === "ready" ? <button type="button" disabled={busy || mutationUncertain} onClick={() => { setSelectedId(null); setDisplayName(""); setEmail(""); setMutationError(""); setEditorMode("new"); }} className="rounded-(--radius-app) bg-(--color-primary-solid) px-3 py-2 text-sm text-white disabled:opacity-50">{t("addContact")}</button> : null}
        </header>
        <div className={`${selected || editorMode ? "hidden lg:block" : ""} shrink-0 border-b border-(--border-app) px-5 py-2 sm:px-6`}>
          <label className="block min-w-0 sm:max-w-xs">
            <span className="sr-only">{t("searchLabel")}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm" />
          </label>
        </div>
        {mutationUncertain ? <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-(--border-app) bg-(--status-warning-bg) px-5 py-3 text-sm">
          <p className="flex-1">{t("liveMutationUncertain")}</p>
          <button type="button" disabled={status !== "ready"} onClick={reviewUncertainMutation} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 disabled:opacity-50">{t("liveReviewed")}</button>
        </div> : null}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row" aria-live="polite">
          <div className={`${selected || editorMode ? "hidden lg:block" : ""} min-h-0 flex-1 overflow-y-auto lg:border-r border-(--border-app)`}>
            {status === "loading" ? <p className="p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
            {status !== "loading" && status !== "ready" ? (
              <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => { setStatus("loading"); setAttempt(value => value + 1); }} />
            ) : null}
            {status === "ready" && visible.length === 0 ? <p className="p-6 text-sm text-(--text-muted)">{t("noMatchingContacts")}</p> : null}
            {status === "ready" ? visible.map((contact) => (
              <button key={contact.id} type="button" onClick={() => { setSelectedId(contact.id); setEditorMode(null); setMutationError(""); }} aria-pressed={selectedId === contact.id} className="flex w-full flex-col gap-1 border-b border-(--border-app) px-5 py-4 text-left hover:bg-(--surface-muted) sm:px-6">
                <span className="font-semibold">{contact.displayName || contact.email}</span>
                <span className="text-xs text-(--text-muted)">{contact.email}</span>
              </button>
            )) : null}
          </div>
          <aside aria-label={t("myContacts")} className={`${selected || editorMode ? "block" : "hidden lg:block"} min-h-0 min-w-0 flex-1 overflow-y-auto p-5 lg:p-6`}>
            <button type="button" disabled={busy} onClick={() => { setSelectedId(null); setEditorMode(null); setMutationError(""); }} className="mb-4 flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-(--color-primary-ink) disabled:opacity-50 lg:hidden"><ChevronLeft size={18} aria-hidden="true" />{t("backToList")}</button>
            {detail}
          </aside>
        </div>
      </section>
    </WorkspaceLayout>
  );
}
