"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, FileText, HelpCircle, SlidersHorizontal } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SearchSyntaxPanel } from "@/components/search/SearchSyntaxPanel";
import { Drawer } from "@/components/overlay/Drawer";
import { LiveMailSearch } from "@/components/search/LiveMailSearch";
import { useMail } from "@/context/mail-context";
import {
  SAVED_SEARCHES,
  SEARCH_CHIPS,
  SEARCH_FACETS,
  SEARCH_GROUPS,
  type SearchResultItem,
} from "@/lib/mock-search";

const SORT_OPTIONS = ["relevance", "newest", "sender"] as const;
const MOCK_TODAY = "2026-09-27";

function matchesPeriod(item: SearchResultItem, period: string) {
  if (period === "all") return true;
  if (!item.dateKey) return false;
  const days = Math.floor((Date.parse(`${MOCK_TODAY}T00:00:00Z`) - Date.parse(`${item.dateKey}T00:00:00Z`)) / 86400000);
  return days >= 0 && days <= (period === "today" ? 0 : period === "lastSevenDays" ? 7 : 183);
}

function matchesFacet(item: SearchResultItem, group: string, id: string) {
  if (group === "period") return matchesPeriod(item, id);
  if (group === "folder") return item.folderId === id;
  if (group === "attachmentType") return item.file?.type.toLowerCase() === id;
  return item.labels?.includes(id) ?? false;
}

function matchesQuery(item: SearchResultItem, kind: string, query: string) {
  const searchable = [item.subject, item.sender, item.folder, item.folderId, item.hitPrefix, item.hit, item.hitSuffix, item.file?.name].join(" ").toLocaleLowerCase();
  const terms = query.match(/(?:[^\s"]+):"[^"]+"|"[^"]+"|\S+/g) ?? [];
  return terms.every((term) => {
    const separator = term.indexOf(":");
    if (separator < 0) return searchable.includes(term.replaceAll('"', "").toLocaleLowerCase());
    const operator = term.slice(0, separator).toLowerCase();
    const value = term.slice(separator + 1).replaceAll('"', "").toLocaleLowerCase();
    if (!value) return false;
    if (operator === "from") return kind !== "person" && item.sender.toLocaleLowerCase().includes(value);
    if (operator === "subject") return item.subject.toLocaleLowerCase().includes(value);
    if (operator === "filename") return item.file?.name.toLocaleLowerCase().includes(value) ?? false;
    if (operator === "in") {
      const folderAlias = value === "받은편지함" ? "inbox" : value === "보낸편지함" ? "sent" : value;
      return (item.folderId ?? item.folder ?? "").toLocaleLowerCase().includes(folderAlias);
    }
    if (operator === "has" && value === "attachment") return Boolean(item.file || item.hasAttachment);
    return false;
  });
}

function SearchPageContent() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("searchPage");
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q");
  const [chips, setChips] = useState(SEARCH_CHIPS);
  const [facets, setFacets] = useState(SEARCH_FACETS);
  const [showSyntax, setShowSyntax] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]>("relevance");
  const query = urlQuery?.trim() ?? "";
  const queryMatches = SEARCH_GROUPS.flatMap((group) => group.items.filter((item) => matchesQuery(item, group.kind, query)));
  const filteredGroups = SEARCH_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      matchesQuery(item, group.kind, query) &&
      chips.every((chip) => !chip.active || (
        chip.id === "senderPark" ? item.sender === "박서준" :
        chip.id === "hasAttachment" ? Boolean(item.file || item.hasAttachment) : matchesPeriod(item, "lastSixMonths")
      )) &&
      facets.every((facet) => {
        const selected = facet.rows.filter((row) => row.checked);
        return selected.length === 0 || selected.some((row) => matchesFacet(item, facet.id, row.id));
      })
    ).sort((a, b) => sortBy === "newest"
      ? (b.dateKey ?? "").localeCompare(a.dateKey ?? "")
      : sortBy === "sender" ? a.sender.localeCompare(b.sender, locale) : 0),
  })).filter((group) => group.items.length > 0);
  const resultCount = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);

  const toggleChip = (id: string) =>
    setChips((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));

  const toggleFacet = (groupId: string, rowId: string) =>
    setFacets((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, rows: g.rows.map((r) => ({
              ...r,
              checked: r.id === rowId ? !r.checked : rowId === "all" || (r.id === "all" && groupId === "period") ? false : r.checked,
            })) }
      )
    );

  const facetControls = () => facets.map((group) => (
    <section key={group.id} aria-label={t(`facets.${group.id}`)}>
      <h2 className="mb-2 text-[11px] font-bold text-(--text-muted)">{t(`facets.${group.id}`)}</h2>
      <div className="flex flex-col gap-1.5">
        {group.rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => toggleFacet(group.id, row.id)}
            aria-pressed={row.checked}
            className="flex min-h-9 items-center gap-2 rounded-(--radius-app) px-1 text-left text-xs hover:bg-(--control-hover) max-lg:min-h-11"
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-sm" style={{
              backgroundColor: row.checked ? "var(--color-primary-solid)" : "transparent",
              border: row.checked ? "none" : "1px solid var(--border-app)",
            }}>
              {row.checked && <Check size={11} strokeWidth={3} className="text-white" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{t(`facetRows.${row.id}`)}</span>
            <span className="shrink-0 text-(--text-muted)">{queryMatches.filter((item) => matchesFacet(item, group.id, row.id)).length}</span>
          </button>
        ))}
      </div>
    </section>
  ));

  return (
    <WorkspaceLayout showGlobalSearch className="flex flex-col lg:flex-row">
      <section aria-label={t("results")} className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-(--border-app)">
        <header className="shrink-0 border-b border-(--border-app) px-5 py-3.5 sm:px-6">
          <div className="flex h-11 items-center gap-2 rounded-[11px] border border-(--border-app) bg-black/2 px-3 dark:bg-white/3">
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
              {query ? `“${query}”` : t("allResults")}
            </h1>
            <span className="shrink-0 text-[11px] text-(--text-muted)">
              {t("resultCount", { count: resultCount })}
            </span>
            <button
              type="button"
              onClick={() => setShowSyntax(true)}
              className="flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) text-(--text-muted) hover:bg-(--control-hover) hover:text-foreground"
              aria-label={t("syntaxHelp")}
              title={t("syntaxHelpShortcut")}
            >
              <HelpCircle size={16} />
            </button>
          </div>
          <div className="mt-2.5 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChip(c.id)}
                  aria-pressed={c.active}
                  className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[11.5px] font-medium transition ${
                    c.active
                      ? "bg-(--color-primary)/10 text-(--color-primary-ink)"
                      : "border border-dashed border-(--border-app) text-(--text-muted)"
                  }`}
                >
                  {c.active && <Check size={11} />}
                  {c.id === "senderPark" ? "박서준" : t(`chips.${c.id}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
              <button type="button" onClick={() => setShowMobileFilters(true)} className="flex min-h-11 items-center gap-1.5 rounded-(--radius-app) px-2.5 text-xs font-semibold text-(--color-primary-ink) hover:bg-(--control-hover) lg:hidden">
                <SlidersHorizontal size={15} /> {t("filters")}
              </button>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as (typeof SORT_OPTIONS)[number])}
                aria-label={t("sortBy")}
                className="min-h-11 rounded-(--radius-app) bg-(--surface-app) px-2 text-xs font-semibold text-(--color-primary-ink) hover:bg-(--control-hover)"
              >
                {SORT_OPTIONS.map((option) => <option key={option} value={option}>{t(`sort.${option}`)}</option>)}
              </select>
            </div>
          </div>
        </header>

        <section aria-label={t("resultList")} className="flex-1 overflow-y-auto">
          {filteredGroups.length === 0 && (
            <p className="p-8 text-center text-sm text-(--text-muted)">{t("noResults")}</p>
          )}
          {filteredGroups.map((group, groupIndex) => (
            <section key={group.kind} aria-labelledby={`search-group-${groupIndex}`}>
              <h2 id={`search-group-${groupIndex}`} className="border-b border-(--border-app) bg-black/1.5 px-5 py-2.5 text-[11px] font-bold text-(--text-muted) dark:bg-white/2 sm:px-6">
                {t(`groups.${group.kind}`)} · {t(group.kind === "person" ? "peopleCount" : "itemCount", { count: group.items.length })}
              </h2>
              {group.items.map((item) => (
                <article
                  key={`${group.kind}-${item.subject}`}
                  className="flex items-start gap-3 border-b border-(--border-app) px-5 py-3 hover:bg-black/1.5 dark:hover:bg-white/2 sm:px-6"
                >
                  <span
                    className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: item.bg, color: item.fg }}
                  >
                    {item.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold">{item.sender}</span>
                      {(item.folderId || item.folder) && (
                        <span className="shrink-0 text-[11px] text-(--text-muted)">{item.folderId ? t(`facetRows.${item.folderId}`) : item.folder}</span>
                      )}
                      {item.dateKey && (
                        <span className="ml-auto shrink-0 text-[11px] text-(--text-muted)">{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.dateKey}T12:00:00Z`))}</span>
                      )}
                    </div>
                    <h3 className="truncate text-[13px] font-medium">{item.subject}</h3>
                    {item.hit && (
                      <p className="truncate text-xs text-(--text-muted)">
                        {item.hitPrefix}
                        <span className="rounded bg-(--status-warning-bg) font-semibold text-(--status-warning)">
                          {item.hit}
                        </span>
                        {item.hitSuffix}
                      </p>
                    )}
                    {item.file && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold text-(--text-muted) dark:bg-white/10">
                          <FileText size={10} />
                          {item.file.type}
                        </span>
                        <span className="truncate text-[11px] text-(--text-muted)">{item.file.name}</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </section>
      </section>

      <aside aria-label={t("searchFilters")} className="hidden w-75 shrink-0 flex-col gap-5 overflow-y-auto bg-(--surface-muted) p-5 lg:flex">
        <p className="text-xs font-bold">{t("narrowResults")}</p>
        {facetControls()}

        <div className="rounded-[11px] border border-(--border-app) bg-background p-3.5">
          <p className="mb-2 text-xs font-bold">{t("examples")}</p>
          <div className="flex flex-col gap-2">
            {SAVED_SEARCHES.map((s) => (
              <button key={s.id} type="button" onClick={() => router.push(`/${locale}/search?q=${encodeURIComponent(s.query)}`)} className="flex min-h-9 items-center gap-2 rounded-(--radius-app) text-left text-xs hover:bg-(--control-hover)">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />
                {s.id === "senderAttachments" ? t("saved.senderAttachments", { name: "박서준" }) : t(`saved.${s.id}`)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {showMobileFilters && <Drawer title={t("searchFilters")} onClose={() => setShowMobileFilters(false)}><div className="flex flex-col gap-5">{facetControls()}</div></Drawer>}
      {showSyntax && <SearchSyntaxPanel onClose={() => setShowSyntax(false)} />}
    </WorkspaceLayout>
  );
}

export default function SearchPage() {
  const { mode } = useMail();
  return (
    <Suspense fallback={null}>
      {mode === "live" ? <LiveMailSearch /> : <SearchPageContent />}
    </Suspense>
  );
}
