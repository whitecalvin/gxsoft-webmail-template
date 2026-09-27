"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid, List, Search } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { BIG_LINKS, FILE_CARDS, FILE_PERIODS, FILE_SORTS, FILE_TYPES } from "@/lib/mock-files";
import type { FileCard, FilePeriodId, FileSizeUnit, FileSortId, FileTypeId, LinkStateId } from "@/lib/mock-files";
import { useToast } from "@/context/toast-context";

// Attachments browser: a grid/list of files pulled from mail, filterable by
// type/period/sort, plus a large-file-link tracker in the right rail.
const LINK_STATE_STYLE: Record<LinkStateId, string> = {
  active: "bg-(--status-success-bg) text-(--status-success)",
  expiring: "bg-(--status-warning-bg) text-(--status-warning)",
  expired: "bg-black/6 text-(--text-muted) dark:bg-white/8",
};

function fileKind(ext: string): FileTypeId {
  if (ext === "PDF" || ext === "DOC") return "document";
  if (ext === "XLS") return "spreadsheet";
  if (ext === "PPT") return "presentation";
  if (ext === "IMG") return "image";
  if (ext === "ZIP") return "archive";
  return "other";
}

function sizeInKb(file: FileCard) {
  return file.sizeAmount * (file.sizeUnit === "MB" ? 1024 : 1);
}

export default function FilesPage() {
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations("filesPage");
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const formatSize = (amount: number, unit: FileSizeUnit) => `${number.format(amount)} ${unit}`;
  const sender = (file: FileCard) => file.fromId === "system" ? t("system") : file.from;
  const [activeType, setActiveType] = useState<FileTypeId | "all">("all");
  const [activePeriod, setActivePeriod] = useState<FilePeriodId>("all");
  const [activeSort, setActiveSort] = useState<FileSortId>("latest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");

  const filteredCards = FILE_CARDS.filter((f) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || f.name.toLowerCase().includes(q) || sender(f).toLowerCase().includes(q);
    const matchesType = activeType === "all" || fileKind(f.ext) === activeType;
    const matchesPeriod = activePeriod === "all" || f.daysAgo <= (activePeriod === "last7" ? 7 : activePeriod === "last30" ? 30 : 365);
    return matchesQuery && matchesType && matchesPeriod;
  }).sort((a, b) => activeSort === "size" ? sizeInKb(b) - sizeInKb(a) : activeSort === "sender" ? sender(a).localeCompare(sender(b), locale) : a.daysAgo - b.daysAgo);

  const openFile = (name: string) => toast.info(t("downloading"), { sub: name });

  return (
    <WorkspaceLayout title={t("title")} className="flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="truncate text-xs text-(--text-muted)">
            {t("summary", { count: 4182, used: formatSize(18.2, "GB"), links: 12 })}
          </p>
        </div>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-9 w-65 rounded-lg bg-black/4 pl-8 pr-2.5 text-xs outline-none dark:bg-white/6"
            />
          </div>
          <div className="flex rounded-lg bg-black/4 p-1 dark:bg-white/6">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label={t("gridView")}
              aria-pressed={view === "grid"}
              className={`flex h-7 w-8 items-center justify-center rounded-md ${view === "grid" ? "bg-background shadow-sm" : "text-(--text-muted)"}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label={t("listView")}
              aria-pressed={view === "list"}
              className={`flex h-7 w-8 items-center justify-center rounded-md ${view === "list" ? "bg-background shadow-sm" : "text-(--text-muted)"}`}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[216px_1fr_300px]">
        <aside aria-label={t("filters")} className="hidden flex-col gap-5 overflow-y-auto border-r border-(--border-app) p-3.5 lg:flex">
          <div>
            <p className="mb-2 px-1 text-[11px] font-bold text-(--text-muted)">{t("type")}</p>
            <div className="flex flex-col gap-0.5">
              <button type="button" onClick={() => setActiveType("all")} aria-pressed={activeType === "all"} className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition ${activeType === "all" ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5"}`}>{t("types.all")}</button>
              {FILE_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setActiveType(type.id)}
                  aria-pressed={activeType === type.id}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    activeType === type.id
                      ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)"
                      : "text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="flex-1 truncate">{t(`types.${type.id}`)}</span>
                  <span>{number.format(type.count)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 px-1 text-[11px] font-bold text-(--text-muted)">{t("period")}</p>
            <div className="flex flex-col gap-0.5">
              {FILE_PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePeriod(p)}
                  aria-pressed={activePeriod === p}
                  className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    activePeriod === p
                      ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)"
                      : "text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {t(`periods.${p}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto rounded-lg border border-(--border-app) p-3">
            <p className="text-[11px] font-semibold">{t("storage", { used: formatSize(18.2, "GB"), total: formatSize(50, "GB") })}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div className="h-full rounded-full" style={{ width: "36%", backgroundColor: "var(--color-primary)" }} />
            </div>
            <p className="mt-1.5 text-[10.5px] text-(--text-muted)">
              {t("storageHint", { count: 20, amount: formatSize(4.1, "GB") })}
            </p>
          </div>
        </aside>

        <section aria-labelledby="recent-attachments-heading" className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 sm:hidden">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="min-h-11 w-full rounded-(--radius-app) border border-(--border-app) bg-background pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)" />
            </div>
            <button type="button" onClick={() => setView("grid")} aria-label={t("gridView")} aria-pressed={view === "grid"} className={`flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) border border-(--border-app) ${view === "grid" ? "bg-(--surface-muted) text-(--color-primary-ink)" : "text-(--text-muted)"}`}><LayoutGrid size={17} /></button>
            <button type="button" onClick={() => setView("list")} aria-label={t("listView")} aria-pressed={view === "list"} className={`flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) border border-(--border-app) ${view === "list" ? "bg-(--surface-muted) text-(--color-primary-ink)" : "text-(--text-muted)"}`}><List size={17} /></button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-(--text-muted)">{t("type")}
              <select aria-label={t("fileType")} value={activeType} onChange={(event) => setActiveType(event.target.value as FileTypeId | "all")} className="min-h-11 min-w-0 rounded-(--radius-app) border border-(--border-app) bg-background px-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-(--focus-ring)">
                <option value="all">{t("types.all")}</option>
                {FILE_TYPES.map((type) => <option key={type.id} value={type.id}>{t(`types.${type.id}`)}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-(--text-muted)">{t("period")}
              <select aria-label={t("filePeriod")} value={activePeriod} onChange={(event) => setActivePeriod(event.target.value as FilePeriodId)} className="min-h-11 min-w-0 rounded-(--radius-app) border border-(--border-app) bg-background px-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-(--focus-ring)">
                {FILE_PERIODS.map((period) => <option key={period} value={period}>{t(`periods.${period}`)}</option>)}
              </select>
            </label>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <h2 id="recent-attachments-heading" className="text-sm font-bold">{t("recentAttachments")}</h2>
            <span className="text-xs text-(--text-muted)">{t("itemCount", { count: filteredCards.length })}</span>
            <div className="ml-auto flex gap-1">
              {FILE_SORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSort(s)}
                  className={`min-h-11 rounded-full px-2.5 text-[11px] font-semibold transition md:min-h-7 ${
                    activeSort === s
                      ? "bg-[#17181B] text-white dark:bg-white dark:text-[#17181B]"
                      : "bg-black/5 text-(--text-muted) dark:bg-white/10"
                  }`}
                >
                  {t(`sorts.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {filteredCards.length === 0 ? (
            <p className="py-10 text-center text-sm text-(--text-muted)">{t("noResults")}</p>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredCards.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => openFile(f.name)}
                  className="rounded-xl border border-(--border-app) p-3 text-left transition hover:bg-black/2 dark:hover:bg-white/3"
                >
                  <div
                    className="mb-2 flex h-16 items-center justify-center rounded-lg text-xs font-bold"
                    style={{ backgroundColor: f.bg, color: f.fg }}
                  >
                    {f.ext}
                  </div>
                  <p className="truncate text-[11.5px] font-semibold">{f.name}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">
                    {sender(f)} · {formatSize(f.sizeAmount, f.sizeUnit)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredCards.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => openFile(f.name)}
                  className="flex items-center gap-3 rounded-lg border border-(--border-app) px-3 py-2 text-left transition hover:bg-black/2 dark:hover:bg-white/3"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                    style={{ backgroundColor: f.bg, color: f.fg }}
                  >
                    {f.ext}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-(--text-muted)">{sender(f)}</span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-(--text-muted)">{formatSize(f.sizeAmount, f.sizeUnit)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside aria-label={t("attachmentSummary")} className="hidden flex-col gap-4 overflow-y-auto border-l border-(--border-app) p-4 lg:flex">
          <div>
            <p className="mb-2 text-xs font-bold">{t("largeLinks")}</p>
            <div className="flex flex-col gap-3">
              {BIG_LINKS.map((l) => (
                <div key={l.name}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">{l.name}</p>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${LINK_STATE_STYLE[l.state]}`}>
                      {t(`linkStates.${l.state}`)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${l.pct}%`,
                        backgroundColor: l.state === "expired" ? "#9A9EA5" : "var(--color-primary)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10.5px] text-(--text-muted)">
                    {l.expiry === "days" ? t("expiry.days", { count: l.days ?? 0 }) : t(`expiry.${l.expiry}`)} · {t("downloads", { count: l.downloads })} · {formatSize(l.sizeAmount, l.sizeUnit)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-black/2 p-3 dark:bg-white/3">
            <p className="text-xs font-semibold">{t("cleanupTitle")}</p>
            <p className="mt-1 text-[11px] text-(--text-muted)">
              {t("cleanupDescription", { years: 2, threshold: formatSize(100, "MB"), count: 14, amount: formatSize(3.2, "GB") })}
            </p>
            <button
              type="button"
              onClick={() => toast.info(t("cleanupOpen", { count: 14 }), { sub: t("cleanupEstimate", { amount: formatSize(3.2, "GB") }) })}
              className="mt-2 h-8 w-full rounded-lg bg-(--color-primary-solid) text-xs font-semibold text-white"
            >
              {t("reviewList")}
            </button>
          </div>
        </aside>
      </div>
    </WorkspaceLayout>
  );
}
