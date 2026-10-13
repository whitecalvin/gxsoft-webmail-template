"use client";
import { DialogActions } from "@/components/overlay/DialogActions";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Glyph from "./MailboxGlyph";
import { preloadMailboxGlyph } from "@/lib/mailbox-glyph-loader";
import { Check, Search, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/overlay/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { ICON_PACKAGES, mailboxIconEntry, searchMailboxIcons } from "@/lib/mailbox-icon-catalog.mjs";

const PAGE_SIZE = 80;
type IconChange = (value: string) => void | boolean | Promise<void | boolean>;
function preloadPicker(value: string) {
  const packageId = mailboxIconEntry(value)?.packageId ?? "lucide";
  for (const name of searchMailboxIcons("", packageId).slice(0, PAGE_SIZE)) void preloadMailboxGlyph(packageId, name);
  const selected = mailboxIconEntry(value);
  if (selected) void preloadMailboxGlyph(selected.packageId, selected.name);
}

export function MailboxIconPickerTrigger({ label, children, value, defaultIcon, onChange, recovery }: {
  label: string; children: ReactNode; value: string; defaultIcon: LucideIcon; onChange: IconChange; recovery?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const generation = useRef(0);
  const close = () => { generation.current++; setOpen(false); };
  return <span className="inline-flex shrink-0" onClick={event => event.stopPropagation()}>
    <Tooltip content={label} side="bottom"><button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-(--text-muted) hover:bg-(--control-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:[@media(pointer:fine)]:size-8"
      onPointerEnter={() => preloadPicker(value)} onFocus={() => preloadPicker(value)} onPointerDown={() => preloadPicker(value)}
      onClick={() => { generation.current++; preloadPicker(value); setOpen(true); }}>{children}</button></Tooltip>
    {open ? createPortal(<MailboxIconPicker label={label} value={value} defaultIcon={defaultIcon} onClose={close} recovery={recovery}
      onChange={async next => {
        const current = generation.current;
        const result = await onChange(next);
        if (result !== false && current === generation.current) close();
        return result;
      }} />, document.body) : null}
  </span>;
}

export function MailboxIconPicker({ label, value, defaultIcon: DefaultIcon, onClose, onChange, recovery }: {
  label: string; value: string; defaultIcon: LucideIcon; onClose: () => void; onChange: IconChange; recovery?: ReactNode;
}) {
  const t = useTranslations("iconPicker");
  const interaction = useTranslations("iconInteraction");
  const folders = useTranslations("folderIcons");
  const service = useTranslations("liveService");
  const [query, setQuery] = useState("");
  const [packageId, setPackageId] = useState(mailboxIconEntry(value)?.packageId ?? "lucide");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const savingRef = useRef(false);
  const selection = useRef({ active: true, sequence: 0 });
  useEffect(() => {
    const pending = selection.current;
    pending.active = true;
    return () => { pending.active = false; pending.sequence++; };
  }, []);
  const close = () => { if (savingRef.current) return; selection.current.sequence++; onClose(); };
  const choose = (next: string) => {
    if (savingRef.current) return;
    draftRef.current = next; setDraft(next); setFailed(false);
  };
  const save = async (next: string) => {
    if (savingRef.current || next === value) return;
    savingRef.current = true; setSaving(true); setFailed(false);
    try {
      const entry = mailboxIconEntry(next);
      // 확정한 아이콘 파일을 준비한 뒤에만 서버에 저장합니다.
      if (entry && entry.packageId !== "emoji" && !await preloadMailboxGlyph(entry.packageId, entry.name)) throw new Error("icon_load_failed");
      if (!selection.current.active) return;
      const accepted = await onChange(next);
      // 서버 저장 거절은 복구 영역에서 한 번만 안내합니다. 파일 로딩 오류는 별도로 유지합니다.
      if (accepted === false && selection.current.active && !recovery) setFailed(true);
    } catch {
      if (selection.current.active) setFailed(true);
    } finally {
      savingRef.current = false;
      if (selection.current.active) setSaving(false);
    }
  };
  const results = useMemo(() => searchMailboxIcons(query, packageId), [query, packageId]);
  const selected = mailboxIconEntry(draft);
  const packLabel = packageId === "emoji" ? t("emoji") : ICON_PACKAGES.find(pack => pack.id === packageId)?.label ?? "";
  const shown = results.slice(0, limit);
  return <div onKeyDownCapture={event => {
    // Escape closes this modal only, never the underlying mobile drawer or mail selection.
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }} onContextMenu={event => event.stopPropagation()}>
    <Modal onClose={close} dismissible={!saving} maxWidth={560} ariaLabel={label}>
      <div aria-busy={saving} className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--border-app) px-4 py-3">
          <h2 className="min-w-0 break-words font-semibold">{label}</h2>
          <Button size="icon" variant="ghost" disabled={saving} aria-label={t("close")} onClick={close}><X size={18} /></Button>
        </header>
        <div className="grid shrink-0 gap-3 border-b border-(--border-app) p-4">
          <div className="flex items-center gap-3 rounded-lg bg-(--surface-muted) p-3" role="status" aria-live="polite">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-(--surface-app) text-(--color-primary-ink)" aria-hidden="true">{selected ? <Glyph name={selected.name} packageId={selected.packageId} size={28} /> : <DefaultIcon size={28} />}</span>
            <div className="min-w-0"><p className="text-sm font-medium">{interaction("preview")}: {selected?.label ?? folders("defaultIcon")}</p><p className="text-xs text-(--text-muted)">{interaction("hint")}</p></div>
          </div>
          <Input type="search" disabled={saving} value={query} aria-label={t("search")} placeholder={t("searchHint")} data-modal-autofocus
            autoComplete="off" leadingIcon={<Search size={18} />} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
          <div role="tablist" aria-label={t("packages")} className="flex min-w-0 flex-wrap gap-2">
            {ICON_PACKAGES.map(pack => <button key={pack.id} disabled={saving} type="button" role="tab" aria-selected={packageId === pack.id}
              className="min-h-11 rounded-lg border border-(--border-app) px-3 text-sm font-medium text-(--text-muted) aria-selected:bg-(--surface-muted) aria-selected:text-(--color-primary-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
              onPointerEnter={() => { for (const name of pack.names.slice(0, PAGE_SIZE)) void preloadMailboxGlyph(pack.id, name); }}
              onFocus={() => { for (const name of pack.names.slice(0, PAGE_SIZE)) void preloadMailboxGlyph(pack.id, name); }}
              onClick={() => { setPackageId(pack.id); setLimit(PAGE_SIZE); }}>{pack.id === "emoji" ? t("emoji") : pack.label} <span className="ml-1 text-xs font-normal text-(--text-muted)">{pack.names.length}</span></button>)}
          </div>
          <p className="text-xs text-(--text-muted)">{t(packageId === "emoji" ? "emojiNote" : "packageNote")}</p>
          {failed ? <p role="alert" className="text-sm text-(--color-danger)">{service("unavailable")}</p> : null}
          {recovery}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <p role="status" className="mb-3 text-xs text-(--text-muted)">{t("results", { count: results.length })}</p>
          <div role="group" aria-label={t("resultsLabel")} className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
            {shown.map(name => <Tooltip key={name} content={mailboxIconEntry(`${packageId}:${name}`)?.label ?? name} side="bottom"><button type="button" disabled={saving} aria-label={`${packLabel}: ${mailboxIconEntry(`${packageId}:${name}`)?.label ?? name}`} aria-pressed={selected?.packageId === packageId && selected?.name === name}
              className="relative flex h-12 min-w-11 items-center justify-center rounded-lg border border-transparent text-foreground hover:bg-(--control-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) aria-pressed:border-(--color-primary-ink) aria-pressed:bg-(--surface-muted) aria-pressed:text-(--color-primary-ink)"
              onPointerEnter={() => { void preloadMailboxGlyph(packageId, name); }} onFocus={() => { void preloadMailboxGlyph(packageId, name); }}
              onClick={() => choose(`${packageId}:${name}`)}><Glyph name={name} packageId={packageId} />{selected?.packageId === packageId && selected?.name === name ? <Check size={10} className="absolute right-0.5 top-0.5" aria-hidden="true" /> : null}</button></Tooltip>)}
          </div>
          {!results.length ? <p className="py-8 text-center text-sm text-(--text-muted)">{t("empty")}</p> : null}
          {shown.length < results.length ? <Button className="mt-4 w-full" variant="ghost" onClick={() => setLimit(current => current + PAGE_SIZE)}>{t("more")}</Button> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-(--border-app) px-4 py-3">
          <Button disabled={saving} variant="ghost" leadingIcon={<DefaultIcon size={18} />} onClick={() => choose("default")}>{folders("defaultIcon")}</Button>
          <DialogActions className="ml-auto"><Button variant="primary" loading={saving} disabled={saving || draft === value} onClick={() => save(draftRef.current)}>{interaction(saving ? "saving" : "apply")}</Button><Button disabled={saving} onClick={close}>{t("cancel")}</Button></DialogActions>
        </footer>
      </div>
    </Modal>
  </div>;
}
