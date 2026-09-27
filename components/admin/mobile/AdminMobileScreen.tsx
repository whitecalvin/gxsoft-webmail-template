"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AdminMobileRow } from "./AdminMobileRow";
import { useToast } from "@/context/toast-context";
import type { AdminMobileScreen as AdminMobileScreenType } from "@/types/admin";
import { formatAdminMobileSubValues } from "@/lib/mock-admin-mobile";
import { useSettings } from "@/context/settings-context";

// Generic renderer for one entry from MOBILE_ADMIN_SCREENS — header (with an
// optional CTA), optional filter chips, a list of AdminMobileRow, and an
// optional footer action. One `screen` config drives all mobile admin pages.
export function AdminMobileScreen({
  screen,
  onBack,
}: {
  screen: AdminMobileScreenType;
  onBack: () => void;
}) {
  const toast = useToast();
  const t = useTranslations("adminMobile");
  const locale = useLocale();
  const { saved } = useSettings();
  const [activeChipIndex, setActiveChipIndex] = useState(0);
  const subValues = formatAdminMobileSubValues(screen, locale, saved.locale.timezone, saved.locale.timeFormat === "12");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-(--border-app) px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={t("backToMenu")}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{t(`screens.${screen.id}.title`)}</p>
          <p className="truncate text-[11px] text-(--text-muted)">{t(`screens.${screen.id}.sub`, subValues)}</p>
        </div>
        {screen.actionLabel && (
          <button
            type="button"
            onClick={() => toast.info(t("actionPreview"))}
            aria-label={t(`screens.${screen.id}.action`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {screen.actionLabel}
          </button>
        )}
      </div>

      {screen.chipCount ? (
        <div className="flex shrink-0 gap-1.5 border-b border-(--border-app) px-4 py-2.5">
          {Array.from({ length: screen.chipCount }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveChipIndex(index)}
              className={`h-7 rounded-full px-3 text-xs font-semibold transition ${
                activeChipIndex === index
                  ? "bg-[#17181B] text-white dark:bg-white dark:text-[#17181B]"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(`screens.${screen.id}.chips.chip${index}`)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {screen.rows.map((row) => (
          <AdminMobileRow key={row.id} screenId={screen.id} row={row} />
        ))}
      </div>

      {(screen.hasFooterText || screen.hasFooterAction) && (
        <div className="flex shrink-0 items-center gap-3 border-t border-(--border-app) px-4 py-3">
          {screen.hasFooterText && (
            <p className="flex-1 text-[12px] leading-relaxed text-(--text-muted)">
              {t(`screens.${screen.id}.footerText`)}
            </p>
          )}
          {screen.hasFooterAction && (
            <button
              type="button"
              onClick={() => toast.info(t("executeAction", { action: t(`screens.${screen.id}.footerBtn`) }))}
              className="h-9 shrink-0 rounded-lg px-4 text-xs font-semibold text-white"
              style={{ backgroundColor: "#17181B" }}
            >
              {t(`screens.${screen.id}.footerBtn`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
