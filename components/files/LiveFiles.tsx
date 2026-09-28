"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Paperclip, Search } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveSearchPage } from "@/lib/tastemail/mail";

type LoadStatus = "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type LoadState = { key: string; status: LoadStatus; page: LiveSearchPage | null };
const PAGE_SIZE = 50;

export function LiveFiles() {
  const t = useTranslations("filesPage");
  const service = useTranslations("liveService");
  const mail = useTranslations("mailList");
  const locale = useLocale();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const key = `${query}|${position}|${attempt}`;
  const current = state?.key === key ? state : null;
  const page = current?.page;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: "", position: String(position), hasAttachment: "1" });
    if (query) params.set("fileQuery", query);
    fetch(`/api/mail/search?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const failure = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof failure === "string" ? failure : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("messages" in payload) || !Array.isArray(payload.messages)) {
          throw new Error("unavailable");
        }
        return payload as LiveSearchPage;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (position > 0 && result.messages.length === 0 && result.total <= position) {
          setPosition(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1) * PAGE_SIZE);
          return;
        }
        setState({ key, status: "ready", page: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const status: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable";
        setState({ key, status, page: null });
      });
    return () => controller.abort();
  }, [query, position, attempt, key]);

  const search = query.toLocaleLowerCase(locale);
  const attachments = page?.messages.flatMap((message) => {
    const senderMatches = message.from.name.toLocaleLowerCase(locale).includes(search) ||
      message.from.email.toLocaleLowerCase(locale).includes(search);
    return (message.attachments ?? [])
      .filter((attachment) => !search || senderMatches || attachment.name.toLocaleLowerCase(locale).includes(search))
      .map((attachment) => ({ message, attachment }));
  }) ?? [];
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const formatSize = (size: number) => size < 1024 ? `${number.format(size)} B`
    : size < 1024 * 1024 ? `${number.format(size / 1024)} KiB` : `${number.format(size / (1024 * 1024))} MiB`;

  return (
    <WorkspaceLayout title={t("title")} className="flex min-h-0 flex-col bg-background">
      <section aria-label={t("recentAttachments")} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-(--border-app) px-5 py-4 sm:px-7">
          <h1 className="text-sm font-semibold">{t("recentAttachments")}</h1>
          <label className="relative ml-auto min-w-0 flex-1 sm:max-w-80">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)" />
            <input value={input} onChange={(event) => { setInput(event.target.value); setPosition(0); }}
              maxLength={256} aria-label={t("search")} placeholder={t("search")}
              className="min-h-11 w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) pr-3 pl-10 text-sm outline-none focus:border-(--color-primary)" />
          </label>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
          {!current ? <p role="status" className="text-sm text-(--text-muted)">{service("loading")}</p>
            : current.status !== "ready" ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <p>{service(current.status)}</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-(--color-primary)">{service("retry")}</button>
            </div>
              : attachments.length === 0 ? <p className="text-sm text-(--text-muted)">{t("noResults")}</p>
                : <ul className="divide-y divide-(--border-app)" aria-label={t("recentAttachments")}>
                  {attachments.map(({ message, attachment }) => (
                    <li key={`${message.id}:${attachment.blobId}`} className="flex min-w-0 items-center gap-3 py-3">
                      <Paperclip size={18} aria-hidden="true" className="shrink-0 text-(--text-muted)" />
                      <div className="min-w-0 flex-1">
                        <a href={`/api/mail/attachments?blobId=${encodeURIComponent(attachment.blobId)}`}
                          className="block truncate text-sm font-semibold text-(--color-primary) underline-offset-2 hover:underline focus-visible:underline">
                          {attachment.name}
                        </a>
                        <p className="truncate text-xs text-(--text-muted)">{message.from.name || message.from.email} · {message.subject || mail("noSubject")}</p>
                      </div>
                      <span className="shrink-0 text-xs text-(--text-muted)">{formatSize(attachment.size)}</span>
                    </li>
                  ))}
                </ul>}
        </div>
        {page && page.total > PAGE_SIZE ? <nav aria-label={t("recentAttachments")} className="flex shrink-0 items-center justify-center gap-4 border-t border-(--border-app) px-4 py-3 text-xs">
          <button type="button" disabled={position === 0} onClick={() => setPosition(Math.max(0, position - PAGE_SIZE))} className="text-(--color-primary) disabled:opacity-40">{mail("livePrevious")}</button>
          <span className="text-(--text-muted)">{Math.min(position + 1, page.total)}–{Math.min(position + PAGE_SIZE, page.total)} / {mail("countUnit", { count: page.total })}</span>
          <button type="button" disabled={position + PAGE_SIZE >= page.total} onClick={() => setPosition(position + PAGE_SIZE)} className="text-(--color-primary) disabled:opacity-40">{mail("liveNext")}</button>
        </nav> : null}
      </section>
    </WorkspaceLayout>
  );
}
