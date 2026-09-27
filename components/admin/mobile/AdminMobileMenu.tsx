"use client";

import { Link } from "@/i18n/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatAdminMobileSubValues, MOBILE_ADMIN_SCREENS } from "@/lib/mock-admin-mobile";
import { useSettings } from "@/context/settings-context";

// Mobile entry point for the Admin Console: a plain list of sections that
// drills into AdminMobileScreen on tap (there's no room for a sidebar).
export function AdminMobileMenu({ onSelect }: { onSelect: (id: string) => void }) {
  const t = useTranslations("adminMobile");
  const locale = useLocale();
  const { saved } = useSettings();
  const nav = useTranslations("adminNav");
  return (
    <section aria-labelledby="admin-mobile-heading" className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-(--border-app) px-4 py-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={nav("backToMail")}
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 id="admin-mobile-heading" className="text-[15px] font-bold">Admin Console</h1>
          <p className="text-[11px] text-(--text-muted)">gxsoft.co.kr</p>
        </div>
      </header>

      <nav aria-label={t("menuLabel")} className="flex-1 overflow-y-auto">
        {MOBILE_ADMIN_SCREENS.map((screen) => (
          <button
            key={screen.id}
            type="button"
            onClick={() => onSelect(screen.id)}
            className="flex w-full items-center gap-3 border-b border-(--border-app) px-4 py-3.5 text-left"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: screen.navDot }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t(`screens.${screen.id}.navLabel`)}</p>
              <p className="truncate text-[11.5px] text-(--text-muted)">{t(`screens.${screen.id}.sub`, formatAdminMobileSubValues(screen, locale, saved.locale.timezone, saved.locale.timeFormat === "12"))}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-(--text-muted)" />
          </button>
        ))}
      </nav>
    </section>
  );
}
