"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { containTabFocus } from "@/components/overlay/contain-tab-focus";
export function NotificationPopover({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("notificationCenter");
  const closeRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <>
    <div aria-hidden="true" className="fixed inset-0 z-(--layer-popover-backdrop)" onClick={onClose} />
    <div ref={panelRef} id={id} role="dialog" aria-labelledby={`${id}-title`} onKeyDown={event => containTabFocus(event, panelRef.current)} className="fixed inset-x-3 top-16 z-(--layer-popover) flex max-h-[calc(100dvh-5rem)] w-auto flex-col overflow-hidden rounded-(--radius-app) border border-(--border-app) bg-background shadow-[0_16px_34px_-18px_rgba(20,22,30,.34)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-85">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-(--border-app) px-3.5 py-3">
        <p id={`${id}-title`} className="text-[13.5px] font-bold">{t("title")}</p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="ml-auto rounded-(--radius-app) p-2 outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring)"><X size={16} /></button>
      </div>
      <p className="px-4 py-6 text-sm text-(--text-muted)">{t("liveUnavailable")}</p>
    </div>
  </>;
}
