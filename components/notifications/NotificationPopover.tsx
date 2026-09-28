"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { NotificationItem } from "@/lib/mock-notifications";
import { containTabFocus } from "@/components/overlay/contain-tab-focus";

const TABS = ["all", "approval", "mention"] as const;
type Tab = (typeof TABS)[number];

export function NotificationPopover({ id, items, live, onMarkAllRead, onClose }: { id: string; items: NotificationItem[]; live: boolean; onMarkAllRead: () => void; onClose: () => void }) {
  const t = useTranslations("notificationCenter");
  const [tab, setTab] = useState<Tab>("all");
  const allTabRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (live) closeRef.current?.focus();
    else allTabRef.current?.focus();
  }, [live]);

  const filtered = items.filter((n) => tab === "all" || n.kind === tab);
  const unreadCount = live ? 0 : items.filter((n) => n.unread).length;
  const countFor = (kind: Tab) => (kind === "all" ? items.length : items.filter((n) => n.kind === kind).length);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-(--layer-popover-backdrop)" onClick={onClose} />
      <div ref={panelRef} id={id} role="dialog" aria-labelledby={`${id}-title`} onKeyDown={(event) => containTabFocus(event, panelRef.current)} className="fixed inset-x-3 top-16 z-(--layer-popover) flex max-h-[calc(100dvh-5rem)] w-auto flex-col overflow-hidden rounded-(--radius-app) border border-(--border-app) bg-background shadow-[0_16px_34px_-18px_rgba(20,22,30,.34)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-85">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-(--border-app) px-3.5 py-3">
          <p id={`${id}-title`} className="text-[13.5px] font-bold">{t("title")}</p>
          {unreadCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {unreadCount}
            </span>
          )}
          {live && <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="ml-auto rounded-(--radius-app) p-2 outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring)"><X size={16} /></button>}
          {!live && <button
            type="button"
            onClick={() => { onMarkAllRead(); allTabRef.current?.focus(); }}
            disabled={unreadCount === 0}
            className="ml-auto inline-flex min-h-11 items-center rounded-(--radius-app) px-2 text-[11.5px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--color-primary-ink)" }}
          >
            {t("markAllRead")}
          </button>}
        </div>

        {live ? <p className="px-4 py-6 text-sm text-(--text-muted)">{t("liveUnavailable")}</p> : <>
        <div className="flex shrink-0 gap-1.5 border-b border-(--border-app) px-3.5 py-1.5">
          {TABS.map((kind) => (
            <button
              key={kind}
              ref={kind === "all" ? allTabRef : undefined}
              type="button"
              onClick={() => setTab(kind)}
              aria-pressed={tab === kind}
              className={`min-h-11 rounded-full px-3 text-[11.5px] font-semibold transition outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring) ${
                tab === kind
                  ? "bg-(--color-primary-solid) text-white"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(kind)} {countFor(kind)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto sm:max-h-85 sm:flex-none">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-(--text-muted)">{t("empty")}</p>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2.5 border-b border-(--border-app) px-3.5 py-2.5 last:border-b-0 hover:bg-black/2 dark:hover:bg-white/3"
              >
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: n.unread ? "var(--color-primary)" : "transparent" }}
                />
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                  style={{ backgroundColor: n.avatarBg, color: n.avatarFg }}
                >
                  {t(`items.${n.id}.avatar`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{t(`items.${n.id}.title`)}</p>
                  <p className="truncate text-[11.5px] text-(--text-muted)">{t(`items.${n.id}.body`)}</p>
                </div>
                <span className="shrink-0 text-[10.5px] text-(--text-muted)">{t(`items.${n.id}.time`)}</span>
              </div>
            ))
          )}
        </div>

        <Link
          href="/approvals"
          onClick={onClose}
          className="flex min-h-11 shrink-0 items-center justify-center border-t border-(--border-app) px-3 text-center text-[11.5px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-(--focus-ring)"
          style={{ color: "var(--color-primary-ink)" }}
        >
          {t("openCenter")}
        </Link>
        </>}
      </div>
    </>
  );
}
