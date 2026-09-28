"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveContact } from "@/lib/tastemail/contacts";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type EditorMode = "new" | "edit" | null;

async function contactMutation(response: Response): Promise<LiveContact> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
    throw new Error(typeof reason === "string" ? reason : "retryable");
  }
  if (!payload || typeof payload !== "object" || !("contact" in payload) || !payload.contact ||
      typeof payload.contact !== "object" || !("id" in payload.contact) || typeof payload.contact.id !== "string") {
    throw new Error("unavailable");
  }
  return payload.contact as LiveContact;
}

export function LiveContacts() {
  const t = useTranslations("contactsPage");
  const service = useTranslations("liveService");
  const importT = useTranslations("contactImport");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [contacts, setContacts] = useState<LiveContact[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/contacts", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("contacts" in payload) || !Array.isArray(payload.contacts)) {
          throw new Error("unavailable");
        }
        return payload.contacts as LiveContact[];
      })
      .then((items) => {
        if (controller.signal.aborted) return;
        setContacts(items);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setContacts([]);
        setSelectedId(null);
        setEditorMode(null);
        setStatus(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [attempt]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? contacts.filter((contact) =>
      `${contact.displayName ?? ""} ${contact.email}`.toLocaleLowerCase().includes(term)) : contacts;
  }, [contacts, query]);
  const selected = visible.find((contact) => contact.id === selectedId) ?? null;

  const mutationMessage = (reason: string) => reason === "conflict" ? importT("duplicateNotice") :
    reason === "invalid_request" ? service("unavailable") :
    reason === "not_found" ? service("unavailable") :
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
    if (busy || !editorMode) return;
    setBusy(true);
    setMutationError("");
    try {
      const response = await fetch(editorMode === "new" ? "/api/mail/contacts" : `/api/mail/contacts/${encodeURIComponent(selectedId ?? "")}`, {
        method: editorMode === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || null, email: email.trim() }),
      });
      const saved = await contactMutation(response);
      setContacts((items) => editorMode === "new" ? [saved, ...items] : items.map((item) => item.id === saved.id ? saved : item));
      setQuery("");
      setSelectedId(saved.id);
      setEditorMode(null);
    } catch (error) {
      setMutationError(mutationMessage(error instanceof Error ? error.message : "retryable"));
    } finally {
      setBusy(false);
    }
  };

  const removeContact = async () => {
    if (!selected || busy || !window.confirm(`${t("delete")} ${selected.displayName || selected.email}?`)) return;
    setBusy(true);
    setMutationError("");
    try {
      const response = await fetch(`/api/mail/contacts/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      setContacts((items) => items.filter((item) => item.id !== selected.id));
      setSelectedId(null);
      setEditorMode(null);
    } catch (error) {
      setMutationError(mutationMessage(error instanceof Error ? error.message : "retryable"));
    } finally {
      setBusy(false);
    }
  };

  const detail = editorMode ? (
    <form onSubmit={saveContact} className="space-y-4">
      <h2 className="text-lg font-semibold">{t(editorMode === "new" ? "newContact" : "editContact")}</h2>
      <label className="block text-sm"><span>{t("fields.name")}</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
      </label>
      <label className="block text-sm"><span>{t("fields.email")}</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
      </label>
      {mutationError ? <p role="alert" className="text-sm text-red-600">{mutationError}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{t("save")}</button>
        <button type="button" disabled={busy} onClick={() => { setEditorMode(null); setMutationError(""); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{t("cancelChanges")}</button>
      </div>
    </form>
  ) : selected ? (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{selected.displayName || selected.email}</h2>
      <p className="break-all text-sm text-(--text-muted)">{t("fields.email")}: {selected.email}</p>
      {mutationError ? <p role="alert" className="text-sm text-red-600">{mutationError}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => startEdit(selected)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm">{t("editContact")}</button>
        <button type="button" disabled={busy} onClick={removeContact} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm text-red-600">{t("delete")}</button>
      </div>
    </div>
  ) : <p className="text-sm text-(--text-muted)">{t("selectPrompt")}</p>;

  return (
    <WorkspaceLayout title={t("title")} className="flex min-h-0 flex-col">
      <section aria-label={t("myContacts")} className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-(--border-app) px-5 py-4 sm:px-6">
          <h1 className="text-base font-semibold">{t("myContacts")}</h1>
          {status === "ready" ? <span className="text-xs text-(--text-muted)">{t("myCount", { count: contacts.length })}</span> : null}
          {status === "ready" ? <button type="button" disabled={busy} onClick={() => { setSelectedId(null); setDisplayName(""); setEmail(""); setMutationError(""); setEditorMode("new"); }} className="rounded-(--radius-app) bg-(--color-primary-solid) px-3 py-2 text-sm text-white disabled:opacity-50">{t("addContact")}</button> : null}
          <label className="ml-auto min-w-0 grow sm:max-w-xs">
            <span className="sr-only">{t("searchLabel")}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm" />
          </label>
        </header>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row" aria-live="polite">
          <div className="min-h-0 flex-1 overflow-y-auto border-r border-(--border-app)">
            {status === "loading" ? <p className="p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
            {status !== "loading" && status !== "ready" ? (
              <div className="p-6 text-sm">
                <p role="alert">{service(status)}</p>
                <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-3 rounded-(--radius-app) border border-(--border-app) px-3 py-2">{service("retry")}</button>
              </div>
            ) : null}
            {status === "ready" && visible.length === 0 ? <p className="p-6 text-sm text-(--text-muted)">{t("noMatchingContacts")}</p> : null}
            {status === "ready" ? visible.map((contact) => (
              <button key={contact.id} type="button" onClick={() => { setSelectedId(contact.id); setEditorMode(null); setMutationError(""); }} aria-pressed={selectedId === contact.id} className="flex w-full flex-col gap-1 border-b border-(--border-app) px-5 py-4 text-left hover:bg-(--surface-muted) sm:px-6">
                <span className="font-semibold">{contact.displayName || contact.email}</span>
                <span className="text-xs text-(--text-muted)">{contact.email}</span>
              </button>
            )) : null}
          </div>
          <aside aria-label={t("myContacts")} className={`${selected || editorMode ? "block" : "hidden lg:block"} min-w-0 flex-1 border-t border-(--border-app) p-5 lg:border-t-0 lg:p-6`}>
            {detail}
          </aside>
        </div>
      </section>
    </WorkspaceLayout>
  );
}
