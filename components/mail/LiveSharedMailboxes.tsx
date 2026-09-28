"use client";

import { LiveHtmlMessageBody } from "./LiveHtmlMessageBody";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveSharedMailbox } from "@/lib/tastemail/shared-mailboxes";
import type { LiveMailPage } from "@/lib/tastemail/mail";
import type { Email } from "@/types/mail";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
const ERROR_STATUSES = new Set<LoadStatus>(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);

export function LiveSharedMailboxes() {
  const t = useTranslations("mailboxesPage");
  const live = useTranslations("mailboxesLive");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [items, setItems] = useState<LiveSharedMailbox[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<LiveSharedMailbox | null>(null);
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [page, setPage] = useState<LiveMailPage | null>(null);
  const [message, setMessage] = useState<Email | null>(null);
  const [pageStatus, setPageStatus] = useState<LoadStatus>("loading");
  const [pageAttempt, setPageAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/shared-mailboxes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
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
  }, [attempt]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ accountId: selected.id, position: String(position) });
    if (mailboxId) query.set("mailboxId", mailboxId);
    fetch(`/api/mail/shared-messages?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("messages" in payload) || !Array.isArray(payload.messages)) throw new Error("unavailable");
        return payload as LiveMailPage;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPage(result);
        setMessage(null);
        setPageStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        setPageStatus(ERROR_STATUSES.has(reason as LoadStatus) ? reason as LoadStatus : "retryable");
      });
    return () => controller.abort();
  }, [selected, mailboxId, position, pageAttempt]);

  function openMailbox(item: LiveSharedMailbox) {
    setSelected(item);
    setMailboxId(null);
    setPosition(0);
    setPage(null);
    setMessage(null);
    setPageStatus("loading");
  }

  return (
    <WorkspaceLayout title={t("title")} className="overflow-y-auto bg-(--surface-muted)">
      <section aria-label={t("sharedMailboxes")} className="mx-auto max-w-4xl p-5 sm:p-8">
        <h1 className="mb-5 text-lg font-semibold">{selected ? selected.displayName || selected.address : t("sharedMailboxes")}</h1>
        {selected ? (
          <div>
            <button type="button" onClick={() => { setSelected(null); setMessage(null); }} className="mb-4 rounded-lg border border-(--border-app) bg-background px-3 py-2 text-sm">{live("back")}</button>
            {pageStatus === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
            {pageStatus !== "loading" && pageStatus !== "ready" ? (
              <div role="alert" className="rounded-xl border border-(--border-app) bg-background p-5 text-sm">
                <p>{service(pageStatus)}</p>
                <button type="button" onClick={() => { setPageStatus("loading"); setPageAttempt((value) => value + 1); }} className="mt-3 rounded-lg border border-(--border-app) px-3 py-2">{service("retry")}</button>
              </div>
            ) : null}
            {pageStatus === "ready" && page ? (
              <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
                <nav aria-label={live("folders")} className="flex gap-2 overflow-x-auto lg:flex-col">
                  {page.mailboxes.map((folder) => (
                    <button key={folder.id} type="button" aria-current={page.mailboxId === folder.id ? "page" : undefined}
                      onClick={() => { setMailboxId(folder.id); setPosition(0); setPageStatus("loading"); }}
                      className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${page.mailboxId === folder.id ? "bg-(--color-primary)/10 font-semibold" : "bg-background"}`}>
                      {folder.name} <span className="text-xs text-(--text-muted)">{folder.unreadEmails}</span>
                    </button>
                  ))}
                </nav>
                <div className="min-w-0 rounded-xl border border-(--border-app) bg-background">
                  {message ? (
                    <article className="p-5">
                      <button type="button" onClick={() => setMessage(null)} className="mb-4 text-sm text-(--color-primary-ink)">{live("backToMessages")}</button>
                      <h2 className="text-lg font-semibold">{message.subject}</h2>
                      <p className="mt-2 text-sm text-(--text-muted)">{message.from.name} &lt;{message.from.email}&gt; · {message.receivedAt}</p>
                      {message.htmlBody ? <LiveHtmlMessageBody html={message.htmlBody} subject={message.subject} blockedExternalImages={message.blockedExternalImages} attachments={message.attachments} accountId={selected.id} /> :
                        <div className="mt-6 space-y-4 whitespace-pre-wrap text-sm">{message.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
                      {message.attachments?.length ? <ul className="mt-6 border-t border-(--border-app) pt-4 text-sm">{message.attachments.map((attachment) => <li key={attachment.blobId}>
                        <a href={`/api/mail/attachments?${new URLSearchParams({ accountId: selected.id, blobId: attachment.blobId })}`} className="text-(--color-primary-ink) underline-offset-2 hover:underline focus-visible:underline">{attachment.name}</a>
                      </li>)}</ul> : null}
                    </article>
                  ) : (
                    <>
                      {page.messages.length ? <ul className="divide-y divide-(--border-app)">{page.messages.map((item) => (
                        <li key={item.id}><button type="button" onClick={() => setMessage(item)} className="w-full p-4 text-left hover:bg-(--surface-muted)">
                          <span className="block truncate text-sm font-semibold">{item.from.name || item.from.email} · {item.subject}</span>
                          <span className="block truncate text-xs text-(--text-muted)">{item.preview}</span>
                        </button></li>
                      ))}</ul> : <p className="p-5 text-sm text-(--text-muted)">{live("noMessages")}</p>}
                      {page.total > page.limit ? <div className="flex items-center justify-between border-t border-(--border-app) p-3 text-sm">
                        <button type="button" disabled={position === 0} onClick={() => { setPosition(Math.max(0, position - page.limit)); setPageStatus("loading"); }} className="disabled:opacity-40">{live("previous")}</button>
                        <span>{position + 1}–{Math.min(position + page.limit, page.total)} / {page.total}</span>
                        <button type="button" disabled={position + page.limit >= page.total} onClick={() => { setPosition(position + page.limit); setPageStatus("loading"); }} className="disabled:opacity-40">{live("next")}</button>
                      </div> : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : <>
        {status === "loading" ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? (
          <div role="alert" className="rounded-xl border border-(--border-app) bg-background p-5 text-sm">
            <p>{service(status)}</p>
            <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} className="mt-3 rounded-(--radius-app) border border-(--border-app) px-3 py-2">{service("retry")}</button>
          </div>
        ) : null}
        {status === "ready" && items.length === 0 ? <p className="rounded-xl border border-(--border-app) bg-background p-5 text-sm text-(--text-muted)">{live("empty")}</p> : null}
        {status === "ready" ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {items.map((mailbox) => {
              const percent = mailbox.quotaBytes > 0 ? Math.min(100, Math.round(mailbox.usedBytes / mailbox.quotaBytes * 100)) : 0;
              return (
                <li key={mailbox.id} className="rounded-xl border border-(--border-app) bg-background p-5">
                  <h2 className="truncate font-semibold">{mailbox.rights.mayRead ? <button type="button" onClick={() => openMailbox(mailbox)} className="text-left text-(--color-primary-ink) hover:underline">{mailbox.displayName || mailbox.address}</button> : mailbox.displayName || mailbox.address}</h2>
                  <p className="mt-1 break-all text-xs text-(--text-muted)">{mailbox.address}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
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
    </WorkspaceLayout>
  );
}
