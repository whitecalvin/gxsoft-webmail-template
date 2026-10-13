"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";

import { ReadingPane } from "@/components/mail/ReadingPane";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { MailSearchAutocomplete } from "./MailSearchAutocomplete";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useFullMailTimestamp } from "@/components/mail/useMailTimestamp";
import { useSettings } from "@/context/settings-context";
import { searchCalendarDate, searchDateRange } from "@/lib/search-date-range";
import { useMail } from "@/context/mail-context";
import type { LiveSearchPage } from "@/lib/tastemail/mail";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { requireLiveSearchDetail, requireLiveSearchPage } from "@/lib/tastemail/search-page";
import { mailboxLabel } from "@/lib/mailbox-label";
import type { Email } from "@/types/mail";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "invalid_request";
type SearchState = { key: string; status: LoadStatus; page: LiveSearchPage | null };
const SEARCH_TIMEOUT_MS = 45_000;
const PERIOD_OPTIONS = ["all", "today", "lastSevenDays", "lastSixMonths"] as const;
const FOLDER_OPTIONS = ["all", "inbox", "drafts", "sent", "archive", "spam", "trash"] as const;
const SORT_OPTIONS = ["newest", "oldest"] as const;
type SearchPeriod = (typeof PERIOD_OPTIONS)[number];
type SearchFolder = (typeof FOLDER_OPTIONS)[number] | `custom:${string}`;
type SearchSort = (typeof SORT_OPTIONS)[number];

function periodStart(period: SearchPeriod, timeZone: string): string {
  if (period === "all") return "";
  const start = new Date(`${searchCalendarDate(new Date(), timeZone)}T00:00:00.000Z`);
  if (period === "lastSevenDays") start.setUTCDate(start.getUTCDate() - 6);
  if (period === "lastSixMonths") {
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 6);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, lastDay));
  }
  return start.toISOString().slice(0, 10);
}

export function LiveMailSearch() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const searchControlsId = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const top = useTranslations("topBar");
  const t = useTranslations("searchPage");
  const tMail = useTranslations("mailList");
  const tSidebar = useTranslations("sidebar");
  const formatMailTimestamp = useFullMailTimestamp();
  const { saved } = useSettings();
  const { mailboxes } = useMail();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const requestedMailboxId = searchParams.get("mailboxId");
  const requestedFolderKey = JSON.stringify([requestedMailboxId]);
  const [folderRoute, setFolderRoute] = useState(requestedFolderKey);
  const [period, setPeriod] = useState<SearchPeriod>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const range = searchDateRange(startDate || periodStart(period, saved.locale.timezone), endDate, saved.locale.timezone);
  const { after, before, invalid: invalidRange } = range;
  const [folder, setFolder] = useState<SearchFolder>(requestedMailboxId ? `custom:${requestedMailboxId}` : "all");
  if (folderRoute !== requestedFolderKey) {
    setFolderRoute(requestedFolderKey);
    setFolder(requestedMailboxId ? `custom:${requestedMailboxId}` : "all");
  }
  const [attachmentOnly, setAttachmentOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SearchSort>("newest");
  const [cursor, setCursor] = useState({ key: "", position: 0 });
  const [attempt, setAttempt] = useState(0);
  const requestedMessage = searchParams.get("message");
  const requestedSelectionKey = JSON.stringify([query, requestedMessage, requestedMailboxId]);
  const [selectionRoute, setSelectionRoute] = useState(requestedSelectionKey);
  const [selectedId, setSelectedId] = useState<string | null>(requestedMessage);
  if (selectionRoute !== requestedSelectionKey) {
    setSelectionRoute(requestedSelectionKey);
    setSelectedId(requestedMessage);
  }
  const [state, setState] = useState<SearchState | null>(null);
  const [detailState, setDetailState] = useState<{ id: string; status: LoadStatus; message: Email | null } | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const detailCache = useRef(new Map<string, Email>());
  const filterKey = `${query}|${period}|${startDate}|${endDate}|${saved.locale.timezone}|${folder}|${attachmentOnly}|${sortOrder}`;
  const position = cursor.key === filterKey ? cursor.position : 0;
  const key = `${filterKey}|${position}|${attempt}`;
  const current = state?.key === key ? state : null;
  const status = query && !invalidRange ? current?.status ?? "loading" : "idle";
  const page = current?.page;
  const selectedSummary = page?.messages.find((message) => message.id === selectedId);
  // 검색 요약에는 편지함/읽음/중요 상태가 없으므로 공통 보기에는 상세 응답을 사용합니다.
  const pendingDetailId = selectedSummary?.id ?? null;

  useEffect(() => {
    if (!query || query.length > 256 || invalidRange) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]);
    const params = new URLSearchParams({ q: query, position: String(position), sort: sortOrder });
    if (after) params.set("after", after);
    if (before) params.set("before", before);
    if (folder.startsWith("custom:")) params.set("mailboxId", folder.slice(7));
    else if (folder !== "all") params.set("folder", folder);
    if (attachmentOnly) params.set("hasAttachment", "1");
    fetch(`/api/mail/search?${params}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(response.status === 400 && reason === "invalid_request" ? reason : clientMailFailure(response.status, payload));
        }
        return requireLiveSearchPage(payload);
      })
      .then((result) => {
        if (!controller.signal.aborted) setState({ key, status: "ready", page: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "invalid_request"].includes(reason)
          ? reason as LoadStatus : "retryable";
        if (failure === "unauthorized" || failure === "forbidden") {
          detailCache.current.clear();
          setSelectedId(null);
          setDetailState(null);
        }
        setState({ key, status: failure, page: null });
      });
    return () => controller.abort();
  }, [query, position, after, before, invalidRange, folder, attachmentOnly, sortOrder, key]);

  useEffect(() => {
    if (!pendingDetailId) return;
    const cached = detailCache.current.get(pendingDetailId);
    if (cached) {
      setDetailState({ id: pendingDetailId, status: "ready", message: cached });
      return;
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]);
    setDetailState({ id: pendingDetailId, status: "loading", message: null });
    fetch(`/api/mail/messages/${encodeURIComponent(pendingDetailId)}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        return requireLiveSearchDetail(payload, pendingDetailId);
      })
      .then((message) => {
        if (controller.signal.aborted) return;
        if (detailCache.current.size >= 20) detailCache.current.delete(detailCache.current.keys().next().value!);
        detailCache.current.set(message.id, message);
        setDetailState({ id: pendingDetailId, status: "ready", message });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable";
        if (failure === "unauthorized" || failure === "forbidden") {
          detailCache.current.clear();
          setSelectedId(null);
          setState((current) => current?.key === key ? { key, status: failure, page: null } : current);
        }
        setDetailState({ id: pendingDetailId, status: failure, message: null });
      });
    return () => controller.abort();
  }, [pendingDetailId, detailAttempt, key]);

  const changePosition = (next: number) => {
    setCursor({ key: filterKey, position: next });
    setSelectedId(null);
  };

  const scrollToBottom = () => {
    const results = resultsRef.current;
    if (!results) return;
    results.scrollTo({
      top: results.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <WorkspaceLayout title={top("searchPlaceholder")} showGlobalSearch={false} className="flex min-h-0 flex-col"
      headerActions={
            <div className="ml-auto flex items-center gap-1">
              {page && status === "ready" ? <span className="text-xs text-(--text-muted)">{t("resultCount", { count: page.total })}</span> : null}
              <button type="button" onClick={scrollToBottom} disabled={!page?.messages.length} aria-label={t("scrollToBottom")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) hover:bg-(--surface-muted) disabled:opacity-40 md:hidden">
                <ArrowDownToLine size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setHeaderExpanded((expanded) => !expanded)} aria-controls={searchControlsId} aria-expanded={headerExpanded} aria-label={t(headerExpanded ? "collapseHeader" : "expandHeader")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) hover:bg-(--surface-muted) md:hidden">
                {headerExpanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
            </div>
      }>
      <section aria-label={t("results")} className="flex min-h-0 flex-1 flex-col">
        <header className={`shrink-0 border-b border-(--border-app) px-5 sm:px-6 ${headerExpanded ? "py-3" : "md:py-3"}`}>
          <div id={searchControlsId} className={`${headerExpanded ? "block" : "hidden"} max-h-[50dvh] overflow-y-auto md:block md:max-h-none md:overflow-visible`}>
          <div className="mt-2 w-full min-w-0">
            <MailSearchAutocomplete key={query} initialQuery={query} mobile={false} inputClassName="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background pl-9 pr-8 text-base outline-none focus:border-(--color-primary)"
              onSearch={(term, messageId) => router.push({ pathname: "/search", query: { q: term, ...(requestedMailboxId ? { mailboxId: requestedMailboxId } : {}), ...(messageId ? { message: messageId } : {}) } })} />
          </div>
          <fieldset className="mt-4 min-w-0">
            <legend className="text-xs font-semibold">{t("searchFilters")}</legend>
            <div className="mt-2 grid grid-cols-2 items-end gap-3 lg:grid-cols-6">
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="search-period" className="text-xs text-(--text-muted)">{t("facets.period")}</label>
                <CustomSelect id="search-period" value={period} onChange={(event) => { setPeriod(event.target.value as SearchPeriod); setStartDate(""); setEndDate(""); setSelectedId(null); }} aria-label={t("facets.period")} className="w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs">
                  {PERIOD_OPTIONS.map((value) => <option key={value} value={value}>{t(`facetRows.${value}`)}</option>)}
                </CustomSelect>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="search-folder" className="text-xs text-(--text-muted)">{t("facets.folder")}</label>
                <CustomSelect id="search-folder" value={folder} onChange={(event) => { setFolder(event.target.value as SearchFolder); setSelectedId(null); }} aria-label={t("facets.folder")} className="w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs">
                  {FOLDER_OPTIONS.map((value) => <option key={value} value={value}>{value === "all" ? t("facetRows.all") : tSidebar(value)}</option>)}
                  {mailboxes.filter((mailbox) => mailbox.role === null).map((mailbox) => <option key={mailbox.id} value={`custom:${mailbox.id}`}>{mailbox.name}</option>)}
                </CustomSelect>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="search-start-date" className="text-xs text-(--text-muted)">{t("startDate")}</label>
                <input id="search-start-date" type="date" value={startDate} aria-invalid={invalidRange} aria-describedby={invalidRange ? "search-date-error" : undefined} onChange={(event) => { setStartDate(event.target.value); setPeriod("all"); setSelectedId(null); }} className="app-control min-w-0 w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs text-foreground" />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="search-end-date" className="text-xs text-(--text-muted)">{t("endDate")}</label>
                <input id="search-end-date" type="date" value={endDate} aria-invalid={invalidRange} aria-describedby={invalidRange ? "search-date-error" : undefined} onChange={(event) => { setEndDate(event.target.value); setPeriod("all"); setSelectedId(null); }} className="app-control min-w-0 w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs text-foreground" />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <span id="search-attachment-label" className="text-xs text-(--text-muted)">{t("facets.attachmentType")}</span>
                <button type="button" aria-labelledby="search-attachment-label search-attachment-value" aria-pressed={attachmentOnly} onClick={() => { setAttachmentOnly((value) => !value); setSelectedId(null); }} className={`app-control w-full rounded-(--radius-app) border px-3 text-xs ${attachmentOnly ? "border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary-ink)" : "border-(--border-app)"}`}>
                  <span id="search-attachment-value">{t("chips.hasAttachment")}</span>
                </button>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="search-sort" className="text-xs text-(--text-muted)">{t("sortBy")}</label>
                <CustomSelect id="search-sort" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as SearchSort); setSelectedId(null); }} aria-label={t("sortBy")} className="w-full rounded-(--radius-app) border border-(--border-app) bg-(--surface-app) px-2 text-xs">
                  {SORT_OPTIONS.map((value) => <option key={value} value={value}>{t(`sort.${value}`)}</option>)}
                </CustomSelect>
              </div>
            </div>
            {startDate || endDate ? <button type="button" onClick={() => { setStartDate(""); setEndDate(""); setSelectedId(null); }} className="app-control mt-2 px-2 text-xs text-(--text-muted)">{t("resetDates")}</button> : null}
          </fieldset>
          {invalidRange ? <p id="search-date-error" role="alert" className="mt-2 text-xs text-(--status-danger)">{t("invalidDateRange")}</p> : null}
          </div>
        </header>
        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {status === "ready" && page?.messages.length === 0 ? (
            <p className="p-8 text-center text-sm text-(--text-muted)">{t("noResults")}</p>
          ) : null}
          {query.length > 256 ? <p className="p-8 text-center text-sm text-(--status-danger)">{t("invalidQuery")}</p> : null}
          {status === "loading" && query.length <= 256 ? <p className="p-8 text-center text-sm text-(--text-muted)">{tMail("liveLoading")}</p> : null}
          {status !== "idle" && status !== "loading" && status !== "ready" ? (
            <div className="p-8 text-center text-sm">
              <p className="text-(--status-danger)">{status === "invalid_request" ? t("invalidQuery") : tMail(`live${status[0].toUpperCase()}${status.slice(1)}`)}</p>
              {status !== "invalid_request" ? <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-(--radius-app) border border-(--border-app) px-4 py-2">{tMail("liveRetry")}</button> : null}
            </div>
          ) : null}
          {status === "ready" && page?.messages.map((message) => {
            const selectedDetail = selectedId === message.id && detailState?.id === message.id ? detailState : null;
            const expandedMessage: Email = selectedDetail?.message ?? {
              ...message, to: message.to ?? [], folder: "custom", unread: false, starred: false, detailLoaded: false,
            };
            const mailboxName = mailboxLabel(message.mailboxRole, message.mailboxName, tSidebar);
            return (
            <article key={message.id} className="border-b border-(--border-app) px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setSelectedId((id) => id === message.id ? null : message.id)} aria-expanded={selectedId === message.id} className="block w-full text-left">
                <span className="flex items-center gap-3 text-xs text-(--text-muted)">
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{message.from.name || message.from.email}</span>
                  <time dateTime={message.receivedAt} className="shrink-0">{formatMailTimestamp(message.receivedAt)}</time>
                </span>
                <span className="mt-1 block truncate text-sm font-semibold">{message.subject || tMail("noSubject")}</span>
                <span className="mt-1 block truncate text-xs text-(--text-muted)">{mailboxName ? `${mailboxName} · ` : ""}{message.preview}</span>
              </button>
              {selectedId === message.id ? (
                <div className="mt-4 min-w-0">
                  <ReadingPane key={message.id} onBack={() => setSelectedId(null)} source={{
                    message: expandedMessage,
                    status: selectedDetail?.status === "invalid_request" ? "unavailable" : selectedDetail?.status ?? "loading",
                    retry: () => setDetailAttempt(value => value + 1),
                  }} />
                </div>
              ) : null}
            </article>
            );
          })}
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
