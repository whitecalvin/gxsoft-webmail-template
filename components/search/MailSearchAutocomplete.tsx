"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mail, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { requireLiveSearchPage } from "@/lib/tastemail/search-page";

type Suggestion = { id: string; subject: string; sender: string };
type Results = { key: string; status: "ready" | "error"; items: Suggestion[] };

export function MailSearchAutocomplete({ initialQuery, mobile, inputClassName, onSearch }: {
  initialQuery: string; mobile: boolean; inputClassName: string; onSearch: (query: string, messageId?: string) => void;
}) {
  const t = useTranslations("topBar");
  const ac = useTranslations("searchAutocomplete");
  const { mode, accountAddress } = useMail();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [results, setResults] = useState<Results | null>(null);
  const term = query.trim();
  const valid = term.length >= 2 && term.length <= 256 && !/\p{Cc}/u.test(term);
  const key = JSON.stringify([accountAddress, term]);
  useEffect(() => {
    if (!open || composing || !valid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
      fetch(`/api/mail/search?${new URLSearchParams({ q: term, position: "0" })}`, { cache: "no-store", signal })
        .then(async response => {
          if (!response.ok) throw new Error("search failed");
          return requireLiveSearchPage(await response.json());
        })
        .then(page => {
          if (!signal.aborted) setResults({ key, status: "ready", items: page.messages.slice(0, 6).map(item => ({ id: item.id, subject: item.subject, sender: item.from.name || item.from.email })) });
        })
        .catch(() => { if (!controller.signal.aborted) setResults({ key, status: "error", items: [] }); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, open, composing, valid, term, key]);

  const current = results?.key === key ? results : null;
  const items = current?.items ?? [];
  const show = open && !composing && valid;
  const choose = (item?: Suggestion) => {
    if (!term || term.length > 256) return;
    setOpen(false); setHighlight(-1);
    onSearch(term, item?.id);
  };
  return <form role="search" className="relative w-full" onSubmit={event => { event.preventDefault(); if (!composing) choose(show && highlight >= 0 ? items[highlight] : undefined); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
    <input ref={inputRef} type="search" role="combobox" autoComplete="off" value={query} autoFocus={mobile}
      placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} aria-autocomplete="list" aria-expanded={show} aria-controls={show ? listId : undefined}
      aria-activedescendant={show && items[highlight] ? `${listId}-${highlight}` : undefined} className={inputClassName}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(-1); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onKeyDown={event => {
        if (composing || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); setHighlight(-1); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (items.length) setHighlight(index => event.key === "ArrowDown" ? (index + 1) % items.length : index <= 0 ? items.length - 1 : index - 1);
        }
      }} />
    {query ? <button type="button" onClick={() => { setQuery(""); setHighlight(-1); inputRef.current?.focus(); }} aria-label={t("clearSearch")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--text-muted) hover:bg-(--control-hover)"><X size={14} /></button> : null}
    {show ? <div className="absolute inset-x-0 top-full z-(--layer-popover) mt-1 max-h-[min(60dvh,24rem)] overflow-y-auto rounded-xl border border-(--border-app) bg-background p-1 shadow-xl">
      <div id={listId} role="listbox" aria-label={ac("suggestions")}>
        {items.map((item, index) => <button key={item.id} id={`${listId}-${index}`} type="button" role="option" aria-selected={highlight === index} tabIndex={-1}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => choose(item)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${highlight === index ? "bg-(--control-hover)" : "hover:bg-(--control-hover)"}`}>
          <Mail size={16} className="shrink-0 text-(--text-muted)" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.subject || ac("noSubject")}</span><span className="block truncate text-xs text-(--text-muted)">{item.sender}</span></span>
        </button>)}
      </div>
      {!items.length ? <p role="status" className="px-3 py-2 text-xs text-(--text-muted)">{!current ? ac("loading") : current?.status === "error" ? ac("unavailable") : ac("empty")}</p> : null}
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => choose()} className="flex min-h-11 w-full items-center gap-2 border-t border-(--border-app) px-3 py-2 text-left text-sm text-(--color-primary-ink) hover:bg-(--control-hover)"><Search size={16} /><span className="truncate">{ac("all", { query: term })}</span></button>
    </div> : null}
  </form>;
}
