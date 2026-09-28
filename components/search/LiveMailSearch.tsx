"use client";

import { LiveHtmlMessageBody } from "@/components/mail/LiveHtmlMessageBody";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useMail } from "@/context/mail-context";
import type { LiveSearchPage } from "@/lib/tastemail/mail";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "invalid_request";
type SearchState = { key: string; status: LoadStatus; page: LiveSearchPage | null };
const PERIOD_OPTIONS = ["all", "today", "lastSevenDays", "lastSixMonths"] as const;
const FOLDER_OPTIONS = ["all", "inbox", "sent", "archive"] as const;
type SearchPeriod = (typeof PERIOD_OPTIONS)[number];
type SearchFolder = (typeof FOLDER_OPTIONS)[number] | `custom:${string}`;

function periodStart(period: SearchPeriod): string | null {
  if (period === "all") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "lastSevenDays") start.setDate(start.getDate() - 6);
  if (period === "lastSixMonths") {
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - 6);
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
  }
  // The server's `after` condition is exclusive; include messages at midnight.
  return new Date(start.getTime() - 1).toISOString();
}

export function LiveMailSearch() {
  const t = useTranslations("searchPage");
  const tMail = useTranslations("mailList");
  const { mailboxes } = useMail();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [period, setPeriod] = useState<SearchPeriod>("all");
  const [folder, setFolder] = useState<SearchFolder>("all");
  const [attachmentOnly, setAttachmentOnly] = useState(false);
  const [cursor, setCursor] = useState({ key: "", position: 0 });
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<SearchState | null>(null);
  const filterKey = `${query}|${period}|${folder}|${attachmentOnly}`;
  const position = cursor.key === filterKey ? cursor.position : 0;
  const key = `${filterKey}|${position}|${attempt}`;
  const current = state?.key === key ? state : null;
  const status = current?.status ?? "loading";
  const page = current?.page;

  useEffect(() => {
    if (query.length > 256) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, position: String(position) });
    const after = periodStart(period);
    if (after) params.set("after", after);
    if (folder.startsWith("custom:")) params.set("mailboxId", folder.slice(7));
    else if (folder !== "all") params.set("folder", folder);
    if (attachmentOnly) params.set("hasAttachment", "1");
    fetch(`/api/mail/search?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        return payload as LiveSearchPage;
      })
      .then((result) => {
        if (!controller.signal.aborted) setState({ key, status: "ready", page: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "invalid_request"].includes(reason)
          ? reason as LoadStatus : "retryable";
        setState({ key, status: failure, page: null });
      });
    return () => controller.abort();
  }, [query, position, period, folder, attachmentOnly, key]);

  const changePosition = (next: number) => {
    setCursor({ key: filterKey, position: next });
    setSelectedId(null);
  };

  return (
    <WorkspaceLayout showGlobalSearch className="flex min-h-0 flex-col">
      <section aria-label={t("results")} className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-(--border-app) px-5 py-3 sm:px-6">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-sm font-semibold">{query ? `“${query}”` : t("allResults")}</h1>
            {page ? <span className="shrink-0 text-xs text-(--text-muted)">{t("resultCount", { count: page.total })}</span> : null}
          </div>
          <div role="group" className="mt-2 flex flex-wrap items-center gap-2" aria-label={t("searchFilters")}>
            <select
              value={period}
              onChange={(event) => { setPeriod(event.target.value as SearchPeriod); setSelectedId(null); }}
              aria-label={t("facets.period")}
              className="min-h-10 rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs"
            >
              {PERIOD_OPTIONS.map((value) => <option key={value} value={value}>{t(`facetRows.${value}`)}</option>)}
            </select>
            <select
              value={folder}
              onChange={(event) => { setFolder(event.target.value as SearchFolder); setSelectedId(null); }}
              aria-label={t("facets.folder")}
              className="min-h-10 rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs"
            >
              {FOLDER_OPTIONS.map((value) => <option key={value} value={value}>{t(`facetRows.${value}`)}</option>)}
              {mailboxes.filter((mailbox) => mailbox.role === null).map((mailbox) => <option key={mailbox.id} value={`custom:${mailbox.id}`}>{mailbox.name}</option>)}
            </select>
            <button
              type="button"
              aria-pressed={attachmentOnly}
              onClick={() => { setAttachmentOnly((value) => !value); setSelectedId(null); }}
              className={`min-h-10 rounded-(--radius-app) border px-3 text-xs ${attachmentOnly ? "border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary-ink)" : "border-(--border-app)"}`}
            >
              {t("chips.hasAttachment")}
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {status === "ready" && page?.messages.length === 0 ? (
            <p className="p-8 text-center text-sm text-(--text-muted)">{t("noResults")}</p>
          ) : null}
          {query.length > 256 ? <p className="p-8 text-center text-sm text-(--status-danger)">{t("invalidQuery")}</p> : null}
          {status === "loading" && query.length <= 256 ? <p className="p-8 text-center text-sm text-(--text-muted)">{tMail("liveLoading")}</p> : null}
          {status !== "loading" && status !== "ready" ? (
            <div className="p-8 text-center text-sm">
              <p className="text-(--status-danger)">{status === "invalid_request" ? t("invalidQuery") : tMail(`live${status[0].toUpperCase()}${status.slice(1)}`)}</p>
              {status !== "invalid_request" ? <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-(--radius-app) border border-(--border-app) px-4 py-2">{tMail("liveRetry")}</button> : null}
            </div>
          ) : null}
          {status === "ready" && page?.messages.map((message) => (
            <article key={message.id} className="border-b border-(--border-app) px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setSelectedId((id) => id === message.id ? null : message.id)} aria-expanded={selectedId === message.id} className="block w-full text-left">
                <span className="flex items-center gap-3 text-xs text-(--text-muted)">
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{message.from.name || message.from.email}</span>
                  <span className="shrink-0">{message.mailboxName}</span>
                </span>
                <span className="mt-1 block truncate text-sm font-semibold">{message.subject || tMail("noSubject")}</span>
                <span className="mt-1 block truncate text-xs text-(--text-muted)">{message.preview}</span>
              </button>
              {selectedId === message.id ? (
                <div className="mt-4 rounded-(--radius-app) border border-(--border-app) bg-(--surface-muted) p-4 text-sm">
                  <p className="mb-3 text-xs text-(--text-muted)">{message.from.email} · {message.receivedAt}</p>
                  {message.htmlBody ? <LiveHtmlMessageBody html={message.htmlBody} subject={message.subject} blockedExternalImages={message.blockedExternalImages} attachments={message.attachments} /> :
                    message.body.map((paragraph, index) => <p key={index} className="mb-3 whitespace-pre-wrap">{paragraph}</p>)}
                  {message.attachments?.map((file) => <p key={file.blobId} className="text-xs text-(--text-muted)">{file.name}</p>)}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        {status === "ready" && page && page.total > page.limit ? (
          <nav aria-label={t("results")} className="flex shrink-0 justify-end gap-2 border-t border-(--border-app) p-3">
            <button type="button" disabled={position === 0} onClick={() => changePosition(Math.max(0, position - page.limit))} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm disabled:opacity-40">{tMail("livePrevious")}</button>
            <button type="button" disabled={position + page.limit >= page.total} onClick={() => changePosition(position + page.limit)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm disabled:opacity-40">{tMail("liveNext")}</button>
          </nav>
        ) : null}
      </section>
    </WorkspaceLayout>
  );
}
